import { beforeEach, describe, expect, it, vi } from "vitest";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import {
  createPublicBotChallenge,
  verifyPublicBotChallengeCryptographically
} from "@/lib/security/public-bot-challenge";

describe("public bot challenge", () => {
  beforeEach(() => {
    vi.stubEnv("SECURITY_HMAC_KEY", "test-security-key-that-is-at-least-thirty-two-characters-long");
  });

  it("accepts a fresh signed solution only for its intended action", async () => {
    const challenge = await createPublicBotChallenge("access_request");
    const solution = await solveChallenge({ challenge, deriveKey, timeout: 30_000 });
    expect(solution).not.toBeNull();
    const payload = Buffer.from(JSON.stringify({ challenge, solution }), "utf8").toString("base64");
    await expect(verifyPublicBotChallengeCryptographically(payload, "access_request")).resolves.toBe(true);
  }, 35_000);

  it("rejects missing, malformed, and unsupported proofs", async () => {
    await expect(verifyPublicBotChallengeCryptographically("", "access_request")).resolves.toBe(false);
    await expect(verifyPublicBotChallengeCryptographically("not-base64", "access_request")).resolves.toBe(false);
    await expect(createPublicBotChallenge("unknown_action")).rejects.toThrow("Unsupported bot-challenge action");
  });
});
