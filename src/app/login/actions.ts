"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminSessionCookieName, isAdminTokenValid } from "@/lib/auth/admin-session";
import { appSessionCookieName } from "@/lib/auth/session";
import { hashSessionToken, randomSessionToken, verifyPassword } from "@/lib/auth/password";
import { signInWithSupabasePassword } from "@/lib/auth/supabase-auth";
import { queryPostgres } from "@/lib/db/postgres";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  next: z.string().optional()
});

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

export async function loginUser(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next")?.toString()
  });

  if (!parsed.success) {
    redirect(`/login?error=credentials`);
  }

  const supabaseIdentity = await signInWithSupabasePassword(parsed.data.email, parsed.data.password);
  const userResult = await queryPostgres<{
    user_id: string;
    email: string;
    auth_user_id: string | null;
    password_hash: string | null;
    password_salt: string | null;
    password_iterations: number | null;
    selected_tenant_id: string | null;
  }>(
    `
    select
      u.id as user_id,
      u.email,
      u.auth_user_id,
      c.password_hash,
      c.password_salt,
      c.password_iterations,
      (
        select tu.tenant_id
        from public.tenant_users tu
        where tu.user_id = u.id and tu.status = 'active'
        order by case tu.role when 'owner' then 1 when 'admin' then 2 when 'operator' then 3 else 4 end
        limit 1
      ) as selected_tenant_id
    from public.users u
    left join public.user_password_credentials c on c.user_id = u.id
    where lower(u.email) = lower($1) or u.auth_user_id = $2
    limit 1
    `,
    [parsed.data.email, supabaseIdentity?.authUserId ?? null]
  );
  const user = userResult?.rows[0];

  const localPasswordValid = Boolean(
    user?.password_hash &&
      user.password_salt &&
      verifyPassword({
        password: parsed.data.password,
        hash: user.password_hash,
        salt: user.password_salt,
        iterations: user.password_iterations ?? undefined
      })
  );

  if (!user || (!supabaseIdentity && !localPasswordValid)) {
    redirect(`/login?error=credentials&next=${encodeURIComponent(parsed.data.next ?? "/app")}`);
  }

  if (supabaseIdentity && user.auth_user_id !== supabaseIdentity.authUserId) {
    await queryPostgres(
      `
      update public.users
      set auth_user_id = $2, updated_at = now()
      where id = $1 and (auth_user_id is null or auth_user_id = $2)
      `,
      [user.user_id, supabaseIdentity.authUserId]
    );
  }

  const token = randomSessionToken();
  await queryPostgres(
    `
    insert into public.app_sessions (user_id, session_token_hash, selected_tenant_id, expires_at)
    values ($1, $2, $3, now() + interval '14 days')
    `,
    [user.user_id, hashSessionToken(token), user.selected_tenant_id]
  );

  const cookieStore = await cookies();
  cookieStore.set(appSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });

  redirect(parsed.data.next?.startsWith("/app") ? parsed.data.next : "/app");
}

export async function logoutUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(appSessionCookieName)?.value;
  if (token) {
    await queryPostgres(
      `
      update public.app_sessions
      set revoked_at = now()
      where session_token_hash = $1
      `,
      [hashSessionToken(token)]
    );
  }
  cookieStore.delete(appSessionCookieName);
  cookieStore.delete(adminSessionCookieName);
  redirect("/login");
}
