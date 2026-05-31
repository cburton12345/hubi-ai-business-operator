"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appSessionCookieName } from "@/lib/auth/session";
import { hashPassword, hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { ensureSupabaseAuthUser } from "@/lib/auth/supabase-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";

const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().min(1).max(160),
  password: z.string().min(8).max(200)
});

function appUrl(path: string) {
  const baseUrl = env.FEROCITY_APP_URL ?? "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

export async function acceptInviteAction(formData: FormData) {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password")
  });
  if (!parsed.success) redirect("/login?error=invite");

  const inviteResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    email: string;
    role: "owner" | "admin" | "operator" | "viewer";
  }>(
    `
    select id, tenant_id, email, role
    from public.workspace_invites
    where invite_token_hash = $1
      and status = 'pending'
      and (expires_at is null or expires_at > now())
    limit 1
    `,
    [hashSessionToken(parsed.data.token)]
  );
  const invite = inviteResult?.rows[0];
  if (!invite) redirect("/login?error=invite");

  const supabaseIdentity = await ensureSupabaseAuthUser({
    email: invite.email,
    password: parsed.data.password,
    name: parsed.data.name.trim()
  });
  const userResult = await queryPostgres<{ id: string }>(
    `
    insert into public.users (email, name, platform_role, auth_user_id)
    values (lower($1), $2, 'user', $3)
    on conflict (email) do update
    set name = excluded.name,
        auth_user_id = coalesce(public.users.auth_user_id, excluded.auth_user_id),
        updated_at = now()
    returning id
    `,
    [invite.email, parsed.data.name.trim(), supabaseIdentity?.authUserId ?? null]
  );
  const userId = userResult?.rows[0]?.id;
  if (!userId) redirect("/login?error=invite");

  const credential = hashPassword(parsed.data.password);
  await queryPostgres(
    `
    insert into public.user_password_credentials (user_id, password_hash, password_salt, password_iterations, must_reset_password)
    values ($1, $2, $3, $4, false)
    on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        password_iterations = excluded.password_iterations,
        must_reset_password = false,
        updated_at = now()
    `,
    [userId, credential.hash, credential.salt, credential.iterations]
  );

  await queryPostgres(
    `
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values ($1, $2, $3, 'active')
    on conflict (tenant_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
    `,
    [invite.tenant_id, userId, invite.role]
  );

  await queryPostgres(
    `
    update public.workspace_invites
    set status = 'accepted',
        accepted_user_id = $2,
        accepted_at = now(),
        updated_at = now()
    where id = $1
    `,
    [invite.id, userId]
  );

  await sendTransactionalEmail({
    to: invite.email,
    subject: "Your Ferocity account is ready",
    text: `Hi ${parsed.data.name.trim()},

Your Ferocity account is ready.

You can open your workspace here:
${appUrl("/app")}

Start with Build My System if you want Ferocity to guide setup, or use the dashboard to review leads, automations, service ops, and growth work.`,
    tenantId: invite.tenant_id,
    eventKey: "invite_accepted",
    metadata: {
      inviteId: invite.id,
      role: invite.role,
      userId
    }
  });

  const sessionToken = randomSessionToken();
  await queryPostgres(
    `
    insert into public.app_sessions (user_id, session_token_hash, selected_tenant_id, expires_at)
    values ($1, $2, $3, now() + interval '14 days')
    `,
    [userId, hashSessionToken(sessionToken), invite.tenant_id]
  );

  const cookieStore = await cookies();
  cookieStore.set(appSessionCookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });

  redirect("/app/welcome");
}
