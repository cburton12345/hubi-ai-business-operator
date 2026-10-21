import { createHash, randomBytes } from "node:crypto";

export function createCustomerPortalToken() {
  return `portal_${randomBytes(32).toString("base64url")}`;
}

export function hashCustomerPortalToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isCustomerPortalToken(token: string) {
  return /^portal_[A-Za-z0-9_-]{43}$/.test(token);
}
