import { cookies } from "next/headers";
import crypto from "node:crypto";
import { cache } from "react";
import { env } from "@/lib/env";
import { timingSafeSecretMatch } from "@/lib/security/rotating-secret";

export const adminSessionCookieName = "ferocity_admin_session";

export function isAdminTokenConfigured() {
  // A current value is required because new session cookies are always issued
  // from the primary token. The previous value only keeps existing sessions
  // and callers alive during a bounded overlap window.
  return Boolean(env.ADMIN_ACCESS_TOKEN);
}

export function isAdminTokenValid(token: string | undefined | null) {
  return timingSafeSecretMatch(token, env.ADMIN_ACCESS_TOKEN, env.ADMIN_ACCESS_TOKEN_PREVIOUS);
}

export function adminSessionCookieValue() {
  if (!env.ADMIN_ACCESS_TOKEN) return null;
  return crypto.createHash("sha256").update(`ferocity-admin-session:${env.ADMIN_ACCESS_TOKEN}`).digest("hex");
}

export function isAdminSessionCookieValid(value: string | undefined | null) {
  const previousValue = env.ADMIN_ACCESS_TOKEN_PREVIOUS
    ? crypto.createHash("sha256").update(`ferocity-admin-session:${env.ADMIN_ACCESS_TOKEN_PREVIOUS}`).digest("hex")
    : null;
  return timingSafeSecretMatch(value, adminSessionCookieValue(), previousValue);
}

export const hasAdminSession = cache(async () => {
  if (!isAdminTokenConfigured()) {
    return false;
  }

  const cookieStore = await cookies();
  return isAdminSessionCookieValid(cookieStore.get(adminSessionCookieName)?.value);
});
