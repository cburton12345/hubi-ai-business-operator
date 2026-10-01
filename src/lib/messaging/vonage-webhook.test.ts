import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyVonageSignedWebhook } from "./vonage-webhook";

function token(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${claims}`).digest("base64url");
  return `${header}.${claims}.${signature}`;
}

describe("Vonage signed webhook verification", () => {
  it("verifies the signer, account, freshness, and body hash", () => {
    const rawBody = JSON.stringify({ message_uuid: "message-1", status: "delivered" });
    const signatureSecret = "test-signature-secret";
    const now = 1_800_000_000;
    const authorization = `Bearer ${token({
      api_key: "key-1",
      iss: "Vonage",
      iat: now,
      jti: "event-1",
      payload_hash: crypto.createHash("sha256").update(rawBody).digest("hex")
    }, signatureSecret)}`;
    expect(verifyVonageSignedWebhook({ authorization, rawBody, signatureSecret, apiKey: "key-1", nowSeconds: now })).toMatchObject({ ok: true });
  });

  it("rejects tampered payloads", () => {
    const original = JSON.stringify({ message_uuid: "message-1", status: "sent" });
    const tampered = JSON.stringify({ message_uuid: "message-1", status: "delivered" });
    const signatureSecret = "test-signature-secret";
    const now = 1_800_000_000;
    const authorization = `Bearer ${token({
      api_key: "key-1",
      iss: "Vonage",
      iat: now,
      payload_hash: crypto.createHash("sha256").update(original).digest("hex")
    }, signatureSecret)}`;
    expect(verifyVonageSignedWebhook({ authorization, rawBody: tampered, signatureSecret, apiKey: "key-1", nowSeconds: now })).toMatchObject({ ok: false, reason: "payload_mismatch" });
  });
});
