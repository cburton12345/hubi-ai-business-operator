"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const statusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["new", "reviewing", "invited", "closed", "spam"])
});

const inviteFromRequestSchema = z.object({
  requestId: z.string().uuid(),
  role: z.enum(["owner", "admin", "operator", "viewer"]).default("owner")
});

function inviteUrl(token: string) {
  const baseUrl = env.FEROCITY_APP_URL ?? "http://localhost:3000";
  return new URL(`/invite/${token}`, baseUrl).toString();
}

export async function updateAccessRequestStatusAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = statusSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  await queryPostgres(
    `
    update public.access_requests
    set status = $2, updated_at = now()
    where id = $1
    `,
    [parsed.data.requestId, parsed.data.status]
  );

  revalidatePath("/app/access-requests");
}

export async function createInviteFromAccessRequestAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = inviteFromRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    role: formData.get("role")
  });
  if (!parsed.success) return;

  const requestResult = await queryPostgres<{ email: string; name: string | null; requested_plan: string | null; company_name: string | null }>(
    `
    select email, name, requested_plan, company_name
    from public.access_requests
    where id = $1
    limit 1
    `,
    [parsed.data.requestId]
  );
  const request = requestResult?.rows[0];
  if (!request) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const token = randomSessionToken();
  const workspaceResult = await queryPostgres<{ name: string; slug: string }>(
    "select name, slug from public.tenants where id = $1 limit 1",
    [workspaceId]
  );
  const workspace = workspaceResult?.rows[0];

  await queryPostgres(
    `
    insert into public.workspace_invites (tenant_id, email, role, status, invited_by_user_id, invite_token_hash, expires_at, updated_at)
    values ($1, lower($2), $3, 'pending', $4, $5, now() + interval '14 days', now())
    on conflict (tenant_id, email) do update
    set role = excluded.role,
        status = 'pending',
        invited_by_user_id = excluded.invited_by_user_id,
        invite_token_hash = excluded.invite_token_hash,
        expires_at = excluded.expires_at,
        revoked_at = null,
        updated_at = now()
    `,
    [workspaceId, request.email, parsed.data.role, session?.userId ?? null, hashSessionToken(token)]
  );

  await queryPostgres(
    `
    update public.access_requests
    set status = 'invited',
        metadata_json = metadata_json || $2::jsonb,
        updated_at = now()
    where id = $1
    `,
    [
      parsed.data.requestId,
      JSON.stringify({
        inviteCreatedAt: new Date().toISOString(),
        inviteWorkspaceId: workspaceId,
        requestedPlan: request.requested_plan,
        companyName: request.company_name
      })
    ]
  );

  await sendTransactionalEmail({
    to: request.email,
    subject: `Your Ferocity setup invite${workspace?.name ? ` for ${workspace.name}` : ""}`,
    text: `Hi ${request.name || "there"},

Your Ferocity workspace invite is ready.

Workspace: ${workspace?.name ?? "Ferocity"}
Company: ${request.company_name || "not provided"}
Requested plan: ${request.requested_plan || "not sure yet"}

Create your account here:
${inviteUrl(token)}

Ferocity starts in safe setup mode. It will not send customer messages, publish content, change ads, or start billing until reviewed.`,
    tenantId: workspaceId,
    eventKey: "access_request_invite",
    metadata: {
      accessRequestId: parsed.data.requestId,
      workspaceSlug: workspace?.slug,
      role: parsed.data.role
    }
  });

  revalidatePath("/app/access-requests");
  revalidatePath("/app/access");
  redirect(`/app/access-requests?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(request.email)}`);
}
