import crypto from "node:crypto";

function parseStripeSignature(header: string | null) {
  if (!header) return null;
  const parts = header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [part.slice(0, separator), part.slice(separator + 1)] : ["", ""];
  });
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter(Boolean);
  return timestamp && signatures.length > 0 ? { timestamp, signatures } : null;
}

function timingSafeHexEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  signingSecret: string | undefined | Array<string | undefined>
) {
  const signingSecrets = (Array.isArray(signingSecret) ? signingSecret : [signingSecret]).filter(
    (value): value is string => Boolean(value)
  );
  if (signingSecrets.length === 0) return { ok: false as const, reason: "missing_secret" as const };
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) return { ok: false as const, reason: "missing_signature" as const };

  const timestampMs = Number(parsed.timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false as const, reason: "stale_signature" as const };
  }

  const expectedSignatures = signingSecrets.map((secret) =>
    crypto
      .createHmac("sha256", secret)
      .update(`${parsed.timestamp}.${rawBody}`, "utf8")
      .digest("hex")
  );

  return parsed.signatures.some((signature) =>
    expectedSignatures.some((expected) => timingSafeHexEqual(expected, signature))
  )
    ? { ok: true as const }
    : { ok: false as const, reason: "bad_signature" as const };
}
