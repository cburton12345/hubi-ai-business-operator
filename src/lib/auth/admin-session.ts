import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const adminSessionCookieName = "ferocity_admin_session";

export function isAdminTokenConfigured() {
  return Boolean(env.ADMIN_ACCESS_TOKEN);
}

export function isAdminTokenValid(token: string | undefined | null) {
  return Boolean(env.ADMIN_ACCESS_TOKEN && token && token === env.ADMIN_ACCESS_TOKEN);
}

export async function hasAdminSession() {
  if (!isAdminTokenConfigured()) {
    return false;
  }

  const cookieStore = await cookies();
  return isAdminTokenValid(cookieStore.get(adminSessionCookieName)?.value);
}
