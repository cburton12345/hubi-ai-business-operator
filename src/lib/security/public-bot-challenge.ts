import crypto from "node:crypto";
import { createChallenge, randomInt, verifySolution, type Payload } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { consumePublicValueRateLimit } from "@/lib/security/rate-limit";

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const ALLOWED_ACTIONS = new Set(["access_request"]);

function challengeSecrets() {
  const rootSecret = process.env.SECURITY_HMAC_KEY?.trim();
  if (!rootSecret || rootSecret.length < 32) {
    throw new Error("SECURITY_HMAC_KEY is required for public bot challenges.");
  }
  const derive = (purpose: string) => crypto.createHmac("sha256", rootSecret).update(purpose).digest("hex");
  return {
    signature: derive("altcha:challenge-signature:v1"),
    keySignature: derive("altcha:key-signature:v1")
  };
}

function normalizedAction(value: string) {
  const action = value.trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) throw new Error("Unsupported bot-challenge action.");
  return action;
}

export async function createPublicBotChallenge(actionInput: string) {
  const action = normalizedAction(actionInput);
  const secrets = challengeSecrets();
  return createChallenge({
    algorithm: "PBKDF2/SHA-256",
    cost: 5_000,
    counter: randomInt(10_000, 5_000),
    data: { action },
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: secrets.signature,
    hmacKeySignatureSecret: secrets.keySignature
  });
}

function decodePayload(value: string): Payload | null {
  if (!value || value.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Partial<Payload>;
    if (!parsed.challenge || !parsed.solution) return null;
    return parsed as Payload;
  } catch {
    return null;
  }
}

export async function verifyPublicBotChallengeCryptographically(payloadInput: string, actionInput: string) {
  const action = normalizedAction(actionInput);
  const payload = decodePayload(payloadInput);
  if (!payload || payload.challenge.parameters.data?.action !== action) return false;
  const secrets = challengeSecrets();
  const result = await verifySolution({
    challenge: payload.challenge,
    solution: payload.solution,
    deriveKey,
    hmacSignatureSecret: secrets.signature,
    hmacKeySignatureSecret: secrets.keySignature
  });
  return result.verified === true && result.expired !== true;
}

export async function verifyPublicBotChallenge(payloadInput: string, actionInput: string) {
  const verified = await verifyPublicBotChallengeCryptographically(payloadInput, actionInput).catch(() => false);
  if (!verified) return false;
  const replayFingerprint = crypto.createHash("sha256").update(payloadInput).digest("hex");
  const replayLimit = await consumePublicValueRateLimit({
    scope: `bot-challenge-replay:${normalizedAction(actionInput)}`,
    value: replayFingerprint,
    limit: 1,
    windowSeconds: 10 * 60
  });
  return replayLimit.allowed;
}
