"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminSessionCookieName, adminSessionCookieValue, isAdminTokenValid } from "@/lib/auth/admin-session";
import { appSessionCookieName } from "@/lib/auth/session";
import { hashPassword, hashSessionToken, randomSessionToken, verifyPassword } from "@/lib/auth/password";
import { signInWithSupabasePassword } from "@/lib/auth/supabase-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { consumeLoginRateLimit } from "@/lib/security/rate-limit";
import { safePostLoginDestination } from "@/lib/auth/post-login-destination";
import { boundedUserAgent, sessionCookieOptions, trustedDeviceLabel } from "@/lib/auth/session-policy";
import { normalizeLoginIdentifier } from "@/lib/auth/login-identifier";

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(8),
  next: z.string().optional(),
  lang: z.enum(["en", "es"]).optional()
});

function loginErrorUrl(error: string, next: string | undefined, lang: "en" | "es" | undefined) {
  const params = new URLSearchParams({ error, next: next ?? "/app" });
  if (lang === "es") params.set("lang", "es");
  return `/login?${params.toString()}`;
}

export async function loginAdmin(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const nextPath = String(formData.get("next") ?? "/app");
  const requestHeaders = await headers();
  const adminLimit = await consumeLoginRateLimit({
    scope: "emergency-admin-login",
    identifier: "admin",
    clientHint:
      requestHeaders.get("x-nf-client-connection-ip") ||
      requestHeaders.get("x-forwarded-for") ||
      requestHeaders.get("user-agent") ||
      "unknown",
    limit: 5,
    windowSeconds: 15 * 60
  });

  if (!adminLimit.allowed || !isAdminTokenValid(token)) {
    redirect(`/login?error=1&next=${encodeURIComponent(nextPath)}`);
  }

  const cookieStore = await cookies();
  const sessionValue = adminSessionCookieValue();
  if (!sessionValue) {
    redirect(`/login?error=1&next=${encodeURIComponent(nextPath)}`);
  }
  cookieStore.set(adminSessionCookieName, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
    priority: "high"
  });

  redirect(nextPath.startsWith("/app") ? nextPath : "/app");
}

export async function loginUser(formData: FormData) {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier") ?? formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next")?.toString(),
    lang: formData.get("lang")?.toString()
  });

  if (!parsed.success) {
    redirect(loginErrorUrl("credentials", formData.get("next")?.toString(), formData.get("lang") === "es" ? "es" : "en"));
  }
  const identifier = normalizeLoginIdentifier(parsed.data.identifier);
  if (!identifier) {
    redirect(loginErrorUrl("credentials", parsed.data.next, parsed.data.lang));
  }
  const requestHeaders = await headers();
  const loginLimit = await consumeLoginRateLimit({
    scope: "workspace-password-login",
    identifier: `${identifier.kind}:${identifier.canonical}`,
    clientHint:
      requestHeaders.get("x-nf-client-connection-ip") ||
      requestHeaders.get("x-forwarded-for") ||
      requestHeaders.get("user-agent") ||
      "unknown",
    limit: 10,
    windowSeconds: 15 * 60
  });
  if (!loginLimit.allowed) {
    redirect(loginErrorUrl("credentials", parsed.data.next, parsed.data.lang));
  }

  const resolvedEmail = identifier.kind === "email"
    ? identifier.canonical
    : (await queryPostgres<{ email: string }>(
        `
        with phone_candidates as (
          select distinct u.id, u.email
          from public.operations_workers worker
          join public.users u on u.id = worker.user_id
          join public.tenant_users membership
            on membership.user_id = u.id
           and membership.tenant_id = worker.tenant_id
           and membership.status = 'active'
          join public.tenants tenant
            on tenant.id = worker.tenant_id
           and tenant.status in ('active', 'trial')
          where regexp_replace(coalesce(worker.phone, ''), '[^0-9]', '', 'g') = any($1::text[])
        )
        select email
        from phone_candidates
        where (select count(*) from phone_candidates) = 1
        limit 1
        `,
        [identifier.phoneCandidates]
      ))?.rows[0]?.email ?? null;

  if (!resolvedEmail) {
    redirect(loginErrorUrl("credentials", parsed.data.next, parsed.data.lang));
  }

  const supabaseIdentity = await signInWithSupabasePassword(resolvedEmail, parsed.data.password);
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
    [resolvedEmail, supabaseIdentity?.authUserId ?? null]
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
    redirect(loginErrorUrl("credentials", parsed.data.next, parsed.data.lang));
  }

  if (localPasswordValid && (user.password_iterations ?? 0) < 210000) {
    const upgraded = hashPassword(parsed.data.password);
    await queryPostgres(
      `
      update public.user_password_credentials
      set password_hash = $2, password_salt = $3, password_iterations = $4, updated_at = now()
      where user_id = $1
      `,
      [user.user_id, upgraded.hash, upgraded.salt, upgraded.iterations]
    );
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
  const userAgent = boundedUserAgent(requestHeaders.get("user-agent"));
  const createdSession = await queryPostgres<{ id: string }>(
    `
    insert into public.app_sessions (
      user_id, session_token_hash, selected_tenant_id, user_agent, device_label,
      authentication_method, authenticated_at, last_seen_at, expires_at, absolute_expires_at
    )
    values ($1, $2, $3, $4, $5, 'password', now(), now(), now() + interval '90 days', now() + interval '365 days')
    returning id
    `,
    [user.user_id, hashSessionToken(token), user.selected_tenant_id, userAgent, trustedDeviceLabel(userAgent)]
  );
  if (!createdSession?.rows[0]) {
    redirect(loginErrorUrl("unavailable", parsed.data.next, parsed.data.lang));
  }

  const cookieStore = await cookies();
  cookieStore.set(appSessionCookieName, token, sessionCookieOptions());

  redirect(safePostLoginDestination(parsed.data.next));
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
