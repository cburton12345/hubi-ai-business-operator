import crypto from "node:crypto";

type VerifyMessagingWebhookInput = {
  rawBody: string;
  secret?: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  nowMs?: number;
};

export type MessagingWebhookVerification =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "stale_signature" | "bad_signature" };

function timingSafeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMessagingWebhook({
  rawBody,
  secret,
  timestampHeader,
  signatureHeader,
  nowMs = Date.now()
}: VerifyMessagingWebhookInput): MessagingWebhookVerification {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing_signature" };

  const timestamp = Number(timestampHeader);
  const timestampMs = timestamp * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > 5 * 60 * 1000) {
    return { ok: false, reason: "stale_signature" };
  }

  const providedSignature = signatureHeader.replace(/^sha256=/i, "").trim();
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody}`, "utf8")
    .digest("hex");

  return timingSafeHexEqual(expectedSignature, providedSignature)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
