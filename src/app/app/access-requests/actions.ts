"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { ensureDefaultAgentWorkflows } from "@/lib/ai-workforce/agent-workflows";
import { EARN_AGREEMENT_VERSION, ensureEarnFeatureEntitlements } from "@/lib/billing/earn";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { getDefaultPushNotificationPreferences, upsertPushNotificationPreferences } from "@/lib/push/preferences";

const statusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["new", "reviewing", "invited", "closed", "spam"])
});

const inviteFromRequestSchema = z.object({
  requestId: z.string().uuid(),
  role: z.enum(["owner", "admin", "operator", "viewer"]).default("owner")
});

function inviteUrl(token: string) {
  const baseUrl = env.FEROCITY_APP_URL ?? "https://ferocity.live";
  return new URL(`/invite/${token}`, baseUrl).toString();
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function approvedPlan(value: string | null) {
  const allowed = new Set(["free", "earn", "ferocity_connect", "calls", "job_tracker", "starter", "growth", "operator", "managed_operator", "pro_agency"]);
  return value && allowed.has(value) ? value : "free";
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

  const requestResult = await queryPostgres<{
    email: string;
    name: string | null;
    requested_plan: string | null;
    company_name: string | null;
    business_type: string | null;
    phone: string | null;
    main_goal: string | null;
    metadata_json: Record<string, unknown> | null;
  }>(
    `
    select email, name, requested_plan, company_name, business_type, phone, main_goal, metadata_json
    from public.access_requests
    where id = $1
    limit 1
    `,
    [parsed.data.requestId]
  );
  const request = requestResult?.rows[0];
  if (!request) return;

  const session = await getCurrentAppSession();
  const token = randomSessionToken();
  const metadataWorkspaceId = typeof request.metadata_json?.workspaceId === "string" ? request.metadata_json.workspaceId : null;
  const existingInvite = await queryPostgres<{ tenant_id: string }>(
    `select tenant_id from public.workspace_invites where lower(email)=lower($1) order by updated_at desc limit 1`,
    [request.email]
  );
  let workspaceId = metadataWorkspaceId ?? existingInvite?.rows[0]?.tenant_id ?? null;

  if (!workspaceId) {
    const planKey = approvedPlan(request.requested_plan);
    const workspaceName = request.company_name?.trim() || `${request.name?.trim() || request.email.split("@")[0]} Workspace`;
    const workspaceSlug = `${slugify(workspaceName) || "ferocity-business"}-${randomSessionToken().slice(0, 6).toLowerCase()}`;
    const manualBilling = planKey === "earn" || planKey === "managed_operator" || planKey === "pro_agency";
    const workspace = await queryPostgres<{ id: string }>(
      `insert into public.tenants (name,slug,account_type,status,billing_status,plan_key,onboarding_status)
       values ($1,$2,'customer',$3,$4,$5,'not_started') returning id`,
      [workspaceName, workspaceSlug, planKey === "free" || manualBilling ? "active" : "trial", planKey === "free" ? "none" : manualBilling ? "active" : "trialing", planKey]
    );
    workspaceId = workspace?.rows[0]?.id ?? null;
    if (!workspaceId) throw new Error("The approved customer workspace could not be created.");

    const brand = await queryPostgres<{ id: string }>(
      `insert into public.brands (tenant_id,name,slug,phone,email,business_model,industry,vertical,description,primary_goal,risk_profile,status)
       values ($1,$2,$3,$4,lower($5),'local_service',$6,$6,'Approved Ferocity access request.',$7,'normal','active') returning id`,
      [workspaceId, workspaceName, slugify(workspaceName) || "main-brand", request.phone, request.email, request.business_type, request.main_goal]
    );
    const brandId = brand?.rows[0]?.id;
    if (!brandId) throw new Error("The approved customer brand could not be created.");
    await queryPostgres(
      `insert into public.brand_services (tenant_id,brand_id,name,slug,description,priority,active)
       values ($1,$2,'Primary service','primary-service','Complete guided setup to customize this service.',100,true)
       on conflict (brand_id,slug) do nothing`,
      [workspaceId, brandId]
    );
    await queryPostgres(
      `insert into public.billing_subscriptions (tenant_id,plan_key,status,seats,current_period_start,metadata_json)
       values ($1,$2,$3,1,now(),$4::jsonb) on conflict (tenant_id) do nothing`,
      [workspaceId, planKey, manualBilling ? "manual" : planKey === "free" ? "active" : "trialing", JSON.stringify({ approvedAccessRequestId: parsed.data.requestId, liveBilling: false })]
    );
    if (planKey === "earn") {
      await queryPostgres(
        `insert into public.earn_enrollments (tenant_id,status,agreement_version,metadata_json)
         values ($1,'pending',$2,$3::jsonb) on conflict (tenant_id) do nothing`,
        [workspaceId, EARN_AGREEMENT_VERSION, JSON.stringify({ approvedFromAccessRequest: true, explicitAgreementAcceptanceRequiredAfterSecureLogin: true, providerUsageSponsored: false })]
      );
      await ensureEarnFeatureEntitlements(workspaceId);
    }
    await ensureDefaultAgentWorkflows(workspaceId);
    await upsertPushNotificationPreferences(workspaceId, getDefaultPushNotificationPreferences());
  }

  if (request.requested_plan === "earn") {
    await ensureEarnFeatureEntitlements(workspaceId);
  }

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
        workspaceId,
        approvedAt: new Date().toISOString(),
        approvedByUserId: session?.userId ?? null,
        requestedPlan: request.requested_plan,
        companyName: request.company_name
      })
    ]
  );

  await sendTransactionalEmail({
    to: request.email,
    subject: `Approved: create your Ferocity account${workspace?.name ? ` for ${workspace.name}` : ""}`,
    text: `Hi ${request.name || "there"},

Your Ferocity request has been approved, and your customer portal is ready to claim.

Workspace: ${workspace?.name ?? "Ferocity"}
Company: ${request.company_name || "not provided"}
Requested plan: ${request.requested_plan || "not sure yet"}
Username: ${request.email}

Use this secure link to confirm your name and create your private password:
${inviteUrl(token)}

After setup, sign in at ${new URL("/login", env.FEROCITY_APP_URL ?? "https://ferocity.live").toString()} using your email address as the username.
If you ever forget the password, reset it at ${new URL("/reset-password", env.FEROCITY_APP_URL ?? "https://ferocity.live").toString()}.

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
