import crypto from "node:crypto";

export function createOpaqueToken(prefix: string) {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashOpaqueToken(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function maskPhoneNumber(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length < 4 ? "••••" : `••••${digits.slice(-4)}`;
}
