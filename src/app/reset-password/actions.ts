"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env, hasSupabaseBrowserConfig } from "@/lib/env";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { logAppError } from "@/lib/observability/log-error";
import { consumeLoginRateLimit } from "@/lib/security/rate-limit";

const resetSchema = z.object({
  email: z.string().email()
});

async function getOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (env.FEROCITY_APP_URL) return env.FEROCITY_APP_URL;
  if (host) return `${proto}://${host}`;
  return "https://ferocity.live";
}

export type ResetPasswordState = {
  status: "idle" | "sent" | "error" | "not_ready";
  message: string;
};

export async function requestPasswordReset(
  _state: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address."
    };
  }

  const email = parsed.data.email.toLowerCase();
  const headerStore = await headers();
  const resetLimit = await consumeLoginRateLimit({
    scope: "password-reset",
    identifier: email,
    clientHint:
      headerStore.get("x-nf-client-connection-ip") ||
      headerStore.get("x-forwarded-for") ||
      headerStore.get("user-agent") ||
      "unknown",
    limit: 3,
    windowSeconds: 15 * 60
  });
  const genericResponse: ResetPasswordState = {
    status: "sent",
    message: "If that email has access, a reset link is on the way."
  };
  if (!resetLimit.allowed) return genericResponse;

  const localAccountResult = await queryPostgres<{
    user_id: string;
    email: string;
    tenant_id: string;
    tenant_name: string;
    role: "owner" | "admin" | "operator" | "viewer";
  }>(
    `
    select
      u.id as user_id,
      u.email,
      tu.tenant_id,
      t.name as tenant_name,
      tu.role
    from public.users u
    join public.user_password_credentials c on c.user_id = u.id
    join public.tenant_users tu on tu.user_id = u.id and tu.status = 'active'
    join public.tenants t on t.id = tu.tenant_id and t.status <> 'archived'
    where lower(u.email) = $1
    order by
      case tu.role when 'owner' then 1 when 'admin' then 2 when 'operator' then 3 else 4 end,
      t.created_at asc
    limit 1
    `,
    [email]
  );
  const localAccount = localAccountResult?.rows[0];

  if (localAccount) {
    const token = randomSessionToken();
    await queryPostgres(
      `
      insert into public.workspace_invites
        (tenant_id, email, role, status, invited_by_user_id, invite_token_hash, expires_at, updated_at)
      values ($1, $2, $3, 'pending', $4, $5, now() + interval '1 hour', now())
      on conflict (tenant_id, email) do update
      set role = excluded.role,
          status = 'pending',
          invited_by_user_id = excluded.invited_by_user_id,
          invite_token_hash = excluded.invite_token_hash,
          expires_at = excluded.expires_at,
          accepted_user_id = null,
          accepted_at = null,
          revoked_at = null,
          updated_at = now()
      `,
      [localAccount.tenant_id, localAccount.email, localAccount.role, localAccount.user_id, hashSessionToken(token)]
    );

    const resetUrl = new URL(`/invite/${token}`, await getOrigin()).toString();
    await sendTransactionalEmail({
      to: localAccount.email,
      subject: "Reset your Ferocity password",
      text: `Use this secure link to choose a new Ferocity password:

${resetUrl}

This link expires in one hour. If you did not request it, you can ignore this message.`,
      tenantId: localAccount.tenant_id,
      eventKey: "password_reset",
      metadata: {
        userId: localAccount.user_id,
        workspaceName: localAccount.tenant_name
      }
    });

    return genericResponse;
  }

  if (!hasSupabaseBrowserConfig()) {
    await logAppError({
      source: "reset-password",
      message: "Password reset requested before Supabase public auth config was available.",
      severity: "info"
    });
    return {
      status: "not_ready",
      message: "Password recovery is temporarily unavailable. Please contact your Ferocity administrator."
    };
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/reset-password/update`
  });

  if (error) {
    await logAppError({
      source: "reset-password",
      message: "Supabase password reset email failed.",
      severity: "warning",
      metadata: {
        reason: error.message
      }
    });
  }

  return genericResponse;
}
