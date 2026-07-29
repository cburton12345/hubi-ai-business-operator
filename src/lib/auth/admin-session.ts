import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "@/lib/env";

export const adminSessionCookieName = "ferocity_admin_session";

export function isAdminTokenConfigured() {
  return Boolean(env.ADMIN_ACCESS_TOKEN);
}

export function isAdminTokenValid(token: string | undefined | null) {
  if (!env.ADMIN_ACCESS_TOKEN || !token) return false;
  const expected = Buffer.from(env.ADMIN_ACCESS_TOKEN);
  const candidate = Buffer.from(token);
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export function adminSessionCookieValue() {
  if (!env.ADMIN_ACCESS_TOKEN) return null;
  return crypto.createHash("sha256").update(`ferocity-admin-session:${env.ADMIN_ACCESS_TOKEN}`).digest("hex");
}

export function isAdminSessionCookieValid(value: string | undefined | null) {
  const expectedValue = adminSessionCookieValue();
  if (!expectedValue || !value) return false;
  const expected = Buffer.from(expectedValue);
  const candidate = Buffer.from(value);
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export async function hasAdminSession() {
  if (!isAdminTokenConfigured()) {
    return false;
  }

  const cookieStore = await cookies();
  return isAdminSessionCookieValid(cookieStore.get(adminSessionCookieName)?.value);
}
