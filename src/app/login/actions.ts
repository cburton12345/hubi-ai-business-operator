"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookieName, isAdminTokenValid } from "@/lib/auth/admin-session";

export async function loginAdmin(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const nextPath = String(formData.get("next") ?? "/app");

  if (!isAdminTokenValid(token)) {
    redirect(`/login?error=1&next=${encodeURIComponent(nextPath)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(adminSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  redirect(nextPath.startsWith("/app") ? nextPath : "/app");
}
