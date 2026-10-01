import { ensureDefaultAgentWorkflows } from "../src/lib/ai-workforce/agent-workflows";
import { hashSessionToken, randomSessionToken } from "../src/lib/auth/password";
import { EARN_AGREEMENT_VERSION, ensureEarnFeatureEntitlements } from "../src/lib/billing/earn";
import { queryPostgres } from "../src/lib/db/postgres";
import { sendTransactionalEmail } from "../src/lib/email/transactional";
import { env } from "../src/lib/env";
import { getDefaultPushNotificationPreferences, upsertPushNotificationPreferences } from "../src/lib/push/preferences";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

async function main() {
const requestId = arg("request-id");
if (!requestId) throw new Error("--request-id is required.");
const nameOverride = arg("name");
const phoneOverride = arg("phone");
const sponsorProviderCosts = process.argv.includes("--sponsor-provider-costs");
const sponsorshipCapCents = Number(arg("sponsorship-cap-cents") ?? "5000");
if (sponsorProviderCosts && (!Number.isInteger(sponsorshipCapCents) || sponsorshipCapCents <= 0)) {
  throw new Error("--sponsorship-cap-cents must be a positive integer.");
}

const requestResult = await queryPostgres<{
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company_name: string | null;
  business_type: string | null;
  requested_plan: string | null;
  main_goal: string | null;
  metadata_json: Record<string, unknown> | null;
}>(
  `select id,email,name,phone,company_name,business_type,requested_plan,main_goal,metadata_json
   from public.access_requests where id=$1 limit 1`,
  [requestId]
);
const request = requestResult?.rows[0];
if (!request) throw new Error("Access request was not found.");
const customerName = nameOverride ?? request.name ?? request.email.split("@")[0];
const customerPhone = phoneOverride ?? request.phone;
const planKey = request.requested_plan === "earn" ? "earn" : "free";
const workspaceName = request.company_name?.trim() || `${customerName} Workspace`;
let tenantId = typeof request.metadata_json?.workspaceId === "string" ? request.metadata_json.workspaceId : null;
let workspaceSlug: string | null = null;

if (!tenantId) {
  const existingInvite = await queryPostgres<{ tenant_id: string; slug: string }>(
    `select wi.tenant_id,t.slug from public.workspace_invites wi join public.tenants t on t.id=wi.tenant_id
     where lower(wi.email)=lower($1) order by wi.updated_at desc limit 1`,
    [request.email]
  );
  tenantId = existingInvite?.rows[0]?.tenant_id ?? null;
  workspaceSlug = existingInvite?.rows[0]?.slug ?? null;
}

if (!tenantId) {
  workspaceSlug = `${slugify(workspaceName) || "ferocity-business"}-${randomSessionToken().slice(0, 6).toLowerCase()}`;
  const tenant = await queryPostgres<{ id: string }>(
    `insert into public.tenants (name,slug,account_type,status,billing_status,plan_key,onboarding_status)
     values ($1,$2,'customer','active',$3,$4,'not_started') returning id`,
    [workspaceName, workspaceSlug, planKey === "earn" ? "active" : "none", planKey]
  );
  tenantId = tenant?.rows[0]?.id ?? null;
  if (!tenantId) throw new Error("Customer workspace creation failed.");
  const brand = await queryPostgres<{ id: string }>(
    `insert into public.brands (tenant_id,name,slug,phone,email,business_model,industry,vertical,description,primary_goal,risk_profile,status)
     values ($1,$2,$3,$4,lower($5),'local_service',$6,$6,'Approved Ferocity access request.',$7,'normal','active') returning id`,
    [tenantId, workspaceName, slugify(workspaceName) || "main-brand", customerPhone, request.email, request.business_type, request.main_goal]
  );
  const brandId = brand?.rows[0]?.id;
  if (!brandId) throw new Error("Customer brand creation failed.");
  await queryPostgres(
    `insert into public.brand_services (tenant_id,brand_id,name,slug,description,priority,active)
     values ($1,$2,'Primary service','primary-service','Complete guided setup to customize this service.',100,true)
     on conflict (brand_id,slug) do nothing`,
    [tenantId, brandId]
  );
  await queryPostgres(
    `insert into public.brand_marketing_settings (tenant_id,brand_id,cta_goals,seo_targets,review_strategy,follow_up_strategy,tone_of_voice,approval_mode)
     values ($1,$2,'Capture qualified leads for owner review.','Complete guided setup before publishing.','Review requests remain draft-only until approved.','Follow-up remains review-first until approved.','Clear, direct, helpful, and professional.','manual')
     on conflict (brand_id) do nothing`,
    [tenantId, brandId]
  );
  await queryPostgres(
    `insert into public.forms (tenant_id,brand_id,name,slug,public_key,active)
     values ($1,$2,'Primary Lead Form','primary-lead-form',$3,true) on conflict (brand_id,slug) do nothing`,
    [tenantId, brandId, `${workspaceSlug}-lead-${randomSessionToken().slice(0, 10).toLowerCase()}`]
  );
  await queryPostgres(
    `insert into public.billing_subscriptions (tenant_id,plan_key,status,seats,current_period_start,metadata_json)
     values ($1,$2,$3,1,now(),$4::jsonb) on conflict (tenant_id) do nothing`,
    [tenantId, planKey, planKey === "earn" ? "manual" : "active", JSON.stringify({ approvedAccessRequestId: requestId, liveBilling: false })]
  );
  await ensureDefaultAgentWorkflows(tenantId);
  await upsertPushNotificationPreferences(tenantId, getDefaultPushNotificationPreferences());
}

if (!workspaceSlug) {
  workspaceSlug = (await queryPostgres<{ slug: string }>("select slug from public.tenants where id=$1", [tenantId]))?.rows[0]?.slug ?? null;
}

if (planKey === "earn") {
  await queryPostgres(
    `insert into public.earn_enrollments (tenant_id,status,agreement_version,metadata_json)
     values ($1,'pending',$2,$3::jsonb)
     on conflict (tenant_id) do update set metadata_json=public.earn_enrollments.metadata_json || excluded.metadata_json, updated_at=now()`,
    [tenantId, EARN_AGREEMENT_VERSION, JSON.stringify({
      approvedFromAccessRequest: true,
      explicitAgreementAcceptanceRequiredAfterSecureLogin: true,
      providerUsageSponsored: sponsorProviderCosts,
      sponsorshipCapCents: sponsorProviderCosts ? sponsorshipCapCents : null,
      sponsorshipReason: sponsorProviderCosts ? "Founder-approved customer pilot exception." : null,
      sponsorshipWrittenTerms: sponsorProviderCosts ? `Ferocity covers approved provider usage up to $${(sponsorshipCapCents / 100).toFixed(2)} per month for this named pilot workspace; advertising spend, payment processing, and other third-party charges remain separate.` : null
    })]
  );
  await ensureEarnFeatureEntitlements(tenantId);
}

const inviteToken = randomSessionToken();
await queryPostgres(
  `insert into public.workspace_invites (tenant_id,email,role,status,invite_token_hash,expires_at,updated_at)
   values ($1,lower($2),'owner','pending',$3,now()+interval '14 days',now())
   on conflict (tenant_id,email) do update set role='owner',status='pending',invite_token_hash=excluded.invite_token_hash,expires_at=excluded.expires_at,revoked_at=null,updated_at=now()`,
  [tenantId, request.email, hashSessionToken(inviteToken)]
);
await queryPostgres(
  `update public.access_requests set name=$2,phone=$3,status='invited',metadata_json=coalesce(metadata_json,'{}'::jsonb)||$4::jsonb,updated_at=now() where id=$1`,
  [requestId, customerName, customerPhone, JSON.stringify({ workspaceId: tenantId, workspaceSlug, approvedAt: new Date().toISOString(), inviteCreated: true, providerUsageSponsoredPilot: sponsorProviderCosts })]
);

const configuredBaseUrl = arg("base-url") ?? env.FEROCITY_APP_URL ?? "https://ferocity.live";
const configuredUrl = new URL(configuredBaseUrl);
const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
const baseUrl = localHostnames.has(configuredUrl.hostname) && !process.argv.includes("--allow-local-invite")
  ? "https://ferocity.live"
  : configuredUrl.toString();
const activationUrl = new URL(`/invite/${inviteToken}`, baseUrl).toString();
const emailResult = await sendTransactionalEmail({
  to: request.email,
  subject: "Approved: create your Ferocity account",
  text: `Hi ${customerName},

Your Ferocity Earn request has been approved, and your customer portal is ready to claim.

Workspace: ${workspaceName}
Username: ${request.email}

Use this secure link to confirm your name and create your private password:
${activationUrl}

After setup, sign in at ${new URL("/login", baseUrl).toString()} using your email address as the username.
If you forget the password, reset it at ${new URL("/reset-password", baseUrl).toString()}.

This account starts in safe setup mode. Live messaging, publishing, advertising spend, and financial actions remain off until configured and approved.${sponsorProviderCosts ? `\n\nPilot exception: Ferocity will cover approved provider usage up to $${(sponsorshipCapCents / 100).toFixed(2)} per month for this workspace. Other third-party costs remain separate.` : ""}`,
  tenantId,
  eventKey: "approved_access_request_invite",
  metadata: { accessRequestId: requestId, workspaceSlug, providerUsageSponsoredPilot: sponsorProviderCosts }
});
if (!emailResult.ok) throw new Error(`Workspace was created, but invitation email failed: ${emailResult.error}`);

console.log(JSON.stringify({ ok: true, requestId, tenantId, workspaceSlug, email: request.email, invitationSent: true, providerUsageSponsoredPilot: sponsorProviderCosts, sponsorshipCapCents: sponsorProviderCosts ? sponsorshipCapCents : null }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
