import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMessagingWebhook } from "./verify-messaging-webhook";

const secret = "test-messaging-webhook-secret";
const timestamp = "1785268800";
const nowMs = Number(timestamp) * 1000;
const rawBody = JSON.stringify({ messageId: "message-1", status: "delivered" });
const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

describe("verifyMessagingWebhook", () => {
  it("accepts a current valid signature", () => {
    expect(
      verifyMessagingWebhook({
        rawBody,
        secret,
        timestampHeader: timestamp,
        signatureHeader: `sha256=${signature}`,
        nowMs
      })
    ).toEqual({ ok: true });
  });

  it("rejects a bad signature", () => {
    expect(
      verifyMessagingWebhook({
        rawBody,
        secret,
        timestampHeader: timestamp,
        signatureHeader: "sha256=deadbeef",
        nowMs
      })
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects replayed timestamps", () => {
    expect(
      verifyMessagingWebhook({
        rawBody,
        secret,
        timestampHeader: timestamp,
        signatureHeader: signature,
        nowMs: nowMs + 6 * 60 * 1000
      })
    ).toEqual({ ok: false, reason: "stale_signature" });
  });

  it("fails closed when the server secret is missing", () => {
    expect(
      verifyMessagingWebhook({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        nowMs
      })
    ).toEqual({ ok: false, reason: "missing_secret" });
  });
});
