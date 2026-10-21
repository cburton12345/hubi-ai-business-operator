import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hashPassword, randomSessionToken } from "../src/lib/auth/password";
import { ensureSupabaseAuthUser } from "../src/lib/auth/supabase-auth";
import { queryPostgres, withPostgresTransaction } from "../src/lib/db/postgres";
import { sendTransactionalEmail } from "../src/lib/email/transactional";
import { env } from "../src/lib/env";

const execFileAsync = promisify(execFile);
const defaultWorkflows = [
  ["lead_response_agent", "Lead Response Agent", "Find new leads, prepare first replies, and notify the owner/team.", "hourly"],
  ["follow_up_agent", "Follow-Up Agent", "Find stale leads, callbacks, viewed estimates, and forgotten opportunities.", "daily"],
  ["customer_lifecycle_agent", "Customer Lifecycle Manager", "Recover missed calls and estimates, nurture leads, earn referrals, and grow customer lifetime value.", "daily"],
  ["dispatcher_agent", "AI Dispatcher", "Protect the schedule, find unassigned work, detect conflicts, and recommend the next safe dispatch action.", "hourly"],
  ["review_agent", "Review Agent", "Turn completed jobs into review requests, proof capture, and reputation tasks.", "daily"],
  ["invoice_reminder_agent", "Invoice Reminder Agent", "Find overdue invoices and prepare payment reminder work.", "daily"],
  ["estimator_agent", "AI Estimator", "Read job notes and measurements, prepare material takeoffs, flag missing scope, and build reviewed bid drafts.", "daily"],
  ["seo_marketing_agent", "AI Marketing Department", "Recommend campaigns and prepare useful marketing drafts from real business context.", "weekly"],
  ["authority_manager", "Authority Manager", "Turn completed work, proof, reviews, and customer questions into review-ready authority assets.", "daily"]
] as const;

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
}

function memorablePassword() {
  const words = [
    "amber", "anchor", "atlas", "bison", "cedar", "cinder", "comet", "copper",
    "falcon", "forest", "harbor", "iron", "juniper", "lantern", "maple", "mesa",
    "meteor", "north", "onyx", "orbit", "pine", "raven", "river", "silver",
    "summit", "tiger", "timber", "valley", "velvet", "west", "willow", "zephyr"
  ];
  const selected = Array.from({ length: 5 }, () => words[crypto.randomInt(words.length)]);
  return `${selected.join("-")}-${crypto.randomInt(1000, 10_000)}!`;
}

async function storeInWindowsCredentialManager(email: string, password: string) {
  if (process.platform !== "win32") return false;
  const target = `FerocityOwner:${email.toLowerCase()}`;
  await execFileAsync("cmdkey.exe", [`/generic:${target}`, `/user:${email.toLowerCase()}`, `/pass:${password}`], {
    windowsHide: true
  });
  return true;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? "Ferocity Owner";
  const workspaceName = arg("workspace") ?? `${name} Workspace`;
  if (!email || !email.includes("@")) throw new Error("--email is required.");

  const existing = await queryPostgres<{
    auth_exists: boolean;
    app_user_exists: boolean;
    active_memberships: number;
    pending_invites: number;
  }>(
    `select
       exists(select 1 from auth.users where lower(email)=lower($1)) as auth_exists,
       exists(select 1 from public.users where lower(email)=lower($1)) as app_user_exists,
       (select count(*)::int from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.status='active' where lower(u.email)=lower($1)) as active_memberships,
       (select count(*)::int from public.workspace_invites where lower(email)=lower($1) and status='pending' and expires_at>now()) as pending_invites`,
    [email]
  );
  const prior = existing?.rows[0];
  if (!prior) throw new Error("Account preflight could not read the production identity state.");
  if (prior.auth_exists || prior.app_user_exists || prior.active_memberships > 0 || prior.pending_invites > 0) {
    console.log(JSON.stringify({ ok: true, status: "already_exists", email, ...prior }, null, 2));
    return;
  }

  const password = memorablePassword();
  const identity = await ensureSupabaseAuthUser({ email, password, name });
  if (!identity) throw new Error("Supabase Auth identity creation failed.");
  const credential = hashPassword(password);
  const slug = `${slugify(workspaceName) || "ferocity-business"}-${crypto.randomBytes(3).toString("hex")}`;

  const provisioned = await withPostgresTransaction(async (client) => {
    const tenant = await client.query<{ id: string }>(
      `insert into public.tenants (name,slug,account_type,status,billing_status,plan_key,onboarding_status)
       values ($1,$2,'customer','active','active','operator','not_started') returning id`,
      [workspaceName, slug]
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error("Workspace creation failed.");

    const brand = await client.query<{ id: string }>(
      `insert into public.brands (
         tenant_id,name,slug,email,business_model,description,primary_goal,risk_profile,status
       ) values (
         $1,$2,$3,lower($4),'rental','Owner-operated workspace provisioned without live billing.',
         'Complete guided setup and choose the first business outcome.','normal','active'
       ) returning id`,
      [tenantId, workspaceName, slugify(workspaceName) || "main-brand", email]
    );
    const brandId = brand.rows[0]?.id;
    if (!brandId) throw new Error("Brand creation failed.");

    await client.query(
      `insert into public.brand_services (tenant_id,brand_id,name,slug,description,priority,active)
       values ($1,$2,'Property operations','property-operations','Configure properties, units, receipts, income, jobs, and operating workflows during guided setup.',100,true)`,
      [tenantId, brandId]
    );
    await client.query(
      `insert into public.brand_marketing_settings (
         tenant_id,brand_id,cta_goals,seo_targets,review_strategy,follow_up_strategy,tone_of_voice,approval_mode
       ) values (
         $1,$2,'Owner review before external action.','Complete guided setup before publishing.',
         'Review requests remain off until configured.','Follow-up remains review-first until approved.',
         'Clear, direct, helpful, and professional.','manual'
       )`,
      [tenantId, brandId]
    );

    const user = await client.query<{ id: string }>(
      `insert into public.users (email,name,platform_role,auth_user_id)
       values (lower($1),$2,'user',$3) returning id`,
      [email, name, identity.authUserId]
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("Application user creation failed.");

    await client.query(
      `insert into public.user_password_credentials (
         user_id,password_hash,password_salt,password_iterations,must_reset_password
       ) values ($1,$2,$3,$4,false)`,
      [userId, credential.hash, credential.salt, credential.iterations]
    );
    await client.query(
      `insert into public.tenant_users (tenant_id,user_id,role,status)
       values ($1,$2,'owner','active')`,
      [tenantId, userId]
    );
    await client.query("update public.tenants set owner_user_id=$2,updated_at=now() where id=$1", [tenantId, userId]);
    await client.query(
      `insert into public.billing_subscriptions (
         tenant_id,plan_key,status,seats,current_period_start,metadata_json
       ) values ($1,'operator','manual',1,now(),$2::jsonb)`,
      [tenantId, JSON.stringify({ liveBilling: false, internalOwnerProvisioning: true, provisionedAt: new Date().toISOString() })]
    );
    await client.query(
      `insert into public.workspace_feature_entitlements (
         tenant_id,feature_key,status,usage_limit,usage_period,metadata_json,updated_at
       ) select $1,feature_key,'enabled',null,'monthly',
         metadata_json || jsonb_build_object('provisionedFromPlan','operator','internalOwnerProvisioning',true),now()
       from public.plan_feature_matrix where plan_key='operator' and included=true
       on conflict (tenant_id,feature_key) do update set
         status='enabled',
         metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
         updated_at=now()`,
      [tenantId]
    );
    await client.query(
      `update public.workspace_feature_entitlements
       set usage_limit=7,usage_period='weekly',
         metadata_json=metadata_json || '{"includedWeeklyPublishingMoments":7,"approvalMode":"review_required","overagePolicy":"block","organicOnly":true,"paidSpendSeparate":true,"requiresExplicitOptIn":true,"qualityGateRequired":true}'::jsonb,
         updated_at=now()
       where tenant_id=$1 and feature_key='publishing_queue'`,
      [tenantId]
    );
    for (const [agentKey, agentName, plainGoal, cadenceKey] of defaultWorkflows) {
      await client.query(
        `insert into public.ai_agent_workflows (
           tenant_id,agent_key,agent_name,plain_goal,status,run_mode,cadence_key,
           trigger_json,output_policy_json,next_run_at,metadata_json
         ) values (
           $1,$2,$3,$4,'active','auto_allowed',$5,
           '{"defaultTrigger":true}'::jsonb,
           '{"liveCustomerSends":false,"livePublishing":false,"mode":"auto_allowed","customerSendsControlledSeparately":true,"publicPublishingControlledSeparately":true,"financialAuthorityControlledSeparately":true}'::jsonb,
           now(),'{}'::jsonb
         ) on conflict (tenant_id,agent_key) do nothing`,
        [tenantId, agentKey, agentName, plainGoal, cadenceKey]
      );
    }
    await client.query(
      `insert into public.push_notification_preferences (
         tenant_id,owner_alerts_enabled,min_severity,min_money_cents,notify_revenue,notify_financial,
         notify_customer,notify_legal,notify_safety,notify_automation,notify_low_confidence,notify_approval
       ) values ($1,true,'high',10000,true,true,true,true,true,true,true,true)
       on conflict (tenant_id) do nothing`,
      [tenantId]
    );
    return { tenantId, userId, slug };
  });
  if (!provisioned) throw new Error("The application account transaction failed.");

  const credentialStored = await storeInWindowsCredentialManager(email, password);
  const baseUrl = env.FEROCITY_APP_URL ?? "https://ferocity.live";
  const loginUrl = new URL(`/login?mode=business&next=/app/ferocity?onboarding=1&email=${encodeURIComponent(email)}`, baseUrl).toString();
  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Your Ferocity Operator account is ready",
    text: `Hi ${name},

Your owner-level Ferocity Operator account is ready.

Workspace: ${workspaceName}
Username: ${email}
Temporary password: ${password}

Sign in here:
${loginUrl}

The password is stored locally in Windows Credential Manager under FerocityOwner:${email}. Change it from the secure password-recovery flow if you want a different one.

The workspace starts with full Operator capabilities, but customer messages, publishing, advertising spend, financial actions, and connected-provider writes remain off until they are configured and authorized.`,
    tenantId: provisioned.tenantId,
    eventKey: "internal_operator_account_provisioned",
    metadata: { planKey: "operator", role: "owner", credentialStored }
  });
  if (!emailResult.ok) throw new Error(`The account was created, but the credential email failed: ${emailResult.error}`);

  console.log(JSON.stringify({
    ok: true,
    status: "created",
    email,
    workspaceName,
    workspaceSlug: provisioned.slug,
    planKey: "operator",
    role: "owner",
    credentialStored,
    credentialEmailSent: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
