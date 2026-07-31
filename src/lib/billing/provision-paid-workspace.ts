import { ensureDefaultAgentWorkflows } from "@/lib/ai-workforce/agent-workflows";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { getDefaultPushNotificationPreferences, upsertPushNotificationPreferences } from "@/lib/push/preferences";
import type { SelfServePlanKey } from "@/lib/billing/public-plans";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function appUrl(path: string) {
  return new URL(path, env.FEROCITY_APP_URL ?? "https://ferocity.live").toString();
}

type ProvisionPaidWorkspaceInput = {
  accessRequestId: string;
  email: string;
  companyName: string;
  buyerName?: string | null;
  planKey: SelfServePlanKey;
  stripeEventId: string;
  checkoutSessionId?: string | null;
  customerId?: string | null;
  subscriptionId: string;
};

export async function provisionPaidWorkspace(input: ProvisionPaidWorkspaceInput) {
  const priorSubscription = await queryPostgres<{ tenant_id: string }>(
    `
    select tenant_id
    from public.billing_subscriptions
    where external_subscription_ref = $1
    limit 1
    `,
    [input.subscriptionId]
  );
  if (priorSubscription?.rows[0]) {
    return { tenantId: priorSubscription.rows[0].tenant_id, status: "already_provisioned" as const };
  }

  const existingMembership = await queryPostgres<{ tenant_id: string; slug: string }>(
    `
    select tu.tenant_id, t.slug
    from public.users u
    join public.tenant_users tu on tu.user_id = u.id and tu.status = 'active'
    join public.tenants t on t.id = tu.tenant_id and t.status <> 'archived'
    where lower(u.email) = lower($1)
    order by tu.updated_at desc nulls last, tu.created_at desc
    limit 1
    `,
    [input.email]
  );

  const existingInvite = existingMembership?.rows[0]
    ? null
    : (
        await queryPostgres<{ tenant_id: string; slug: string }>(
          `
          select wi.tenant_id, t.slug
          from public.workspace_invites wi
          join public.tenants t on t.id = wi.tenant_id and t.status <> 'archived'
          where lower(wi.email) = lower($1)
          order by wi.updated_at desc nulls last, wi.created_at desc
          limit 1
          `,
          [input.email]
        )
      )?.rows[0] ?? null;

  let tenantId = existingMembership?.rows[0]?.tenant_id ?? existingInvite?.tenant_id ?? null;
  let workspaceSlug = existingMembership?.rows[0]?.slug ?? existingInvite?.slug ?? null;
  let inviteToken: string | null = null;

  if (!tenantId) {
    const workspaceName = input.companyName.trim();
    const baseSlug = slugify(workspaceName) || "ferocity-business";
    workspaceSlug = `${baseSlug}-${randomSessionToken().slice(0, 6).toLowerCase()}`;
    const brandSlug = slugify(workspaceName) || "main-brand";

    const workspace = await queryPostgres<{ id: string }>(
      `
      insert into public.tenants (
        name, slug, account_type, status, billing_status, plan_key, onboarding_status
      )
      values ($1, $2, 'customer', 'active', 'active', $3, 'not_started')
      returning id
      `,
      [workspaceName, workspaceSlug, input.planKey]
    );
    tenantId = workspace?.rows[0]?.id ?? null;
    if (!tenantId) throw new Error("Stripe payment succeeded but the Ferocity workspace could not be created.");

    const brand = await queryPostgres<{ id: string }>(
      `
      insert into public.brands (
        tenant_id, name, slug, email, business_model, description, primary_goal, risk_profile, status
      )
      values ($1, $2, $3, lower($4), 'local_service', 'Created after verified Ferocity subscription checkout.',
        'Complete guided setup and choose the first business outcome.', 'normal', 'active')
      returning id
      `,
      [tenantId, workspaceName, brandSlug, input.email]
    );
    const brandId = brand?.rows[0]?.id;
    if (!brandId) throw new Error("Stripe payment succeeded but the Ferocity brand could not be created.");

    await queryPostgres(
      `
      insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
      values ($1, $2, 'Primary service', 'primary-service', 'Complete guided setup to customize this service.', 100, true)
      on conflict (brand_id, slug) do nothing
      `,
      [tenantId, brandId]
    );
    await queryPostgres(
      `
      insert into public.brand_marketing_settings (
        tenant_id, brand_id, cta_goals, seo_targets, review_strategy, follow_up_strategy, tone_of_voice, approval_mode
      )
      values (
        $1, $2, 'Capture qualified leads for owner review.', 'Complete guided setup before publishing.',
        'Review requests remain draft-only until approved.', 'Follow-up remains review-first until approved.',
        'Clear, direct, helpful, and professional.', 'low_risk_auto'
      )
      on conflict (brand_id) do nothing
      `,
      [tenantId, brandId]
    );
    await queryPostgres(
      `
      insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
      values ($1, $2, 'Primary Lead Form', 'primary-lead-form', $3, true)
      on conflict (brand_id, slug) do nothing
      `,
      [tenantId, brandId, `${workspaceSlug}-lead-${randomSessionToken().slice(0, 10).toLowerCase()}`]
    );

    await ensureDefaultAgentWorkflows(tenantId);
    await upsertPushNotificationPreferences(tenantId, getDefaultPushNotificationPreferences());
  } else {
    await queryPostgres(
      `
      update public.tenants
      set plan_key = $2,
          billing_status = 'active',
          status = 'active',
          updated_at = now()
      where id = $1
      `,
      [tenantId, input.planKey]
    );
  }

  await queryPostgres(
    `
    insert into public.billing_subscriptions (
      tenant_id, plan_key, status, seats, current_period_start,
      external_customer_ref, external_subscription_ref, metadata_json, updated_at
    )
    values ($1, $2, 'active', 1, now(), $3, $4, $5::jsonb, now())
    on conflict (tenant_id) do update
    set plan_key = excluded.plan_key,
        status = 'active',
        external_customer_ref = excluded.external_customer_ref,
        external_subscription_ref = excluded.external_subscription_ref,
        metadata_json = public.billing_subscriptions.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      tenantId,
      input.planKey,
      input.customerId,
      input.subscriptionId,
      JSON.stringify({
        stripeEventId: input.stripeEventId,
        checkoutSessionId: input.checkoutSessionId,
        accessRequestId: input.accessRequestId,
        publicPaidSignup: true
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.workspace_feature_entitlements (
      tenant_id, feature_key, status, usage_limit, usage_period, metadata_json, updated_at
    )
    select
      $1, feature_key, 'enabled', null, 'monthly',
      metadata_json || jsonb_build_object('provisionedFromPlan', $2::text), now()
    from public.plan_feature_matrix
    where plan_key = $2 and included = true
    on conflict (tenant_id, feature_key) do update
    set status = 'enabled',
        metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [tenantId, input.planKey]
  );

  await queryPostgres(
    `
    update public.workspace_feature_entitlements
    set metadata_json = metadata_json || jsonb_build_object(
          'approvalMode', 'enabled',
          'overagePolicy', case
            when feature_key in ('ai_generation', 'website_import', 'media_library', 'construction_job_health', 'growth_attribution', 'follow_up_recovery')
              then 'allow'
            else 'allow_with_review'
          end,
          'autonomyDefault', 'trusted_autopilot'
        ),
        updated_at = now()
    where tenant_id = $1
      and feature_key = any($2::text[])
    `,
    [
      tenantId,
      [
        "ai_generation",
        "website_import",
        "seo_autopilot",
        "ai_search_visibility",
        "content_studio",
        "media_library",
        "authority_engine",
        "construction_job_health",
        "growth_attribution",
        "follow_up_recovery"
      ]
    ]
  );

  await queryPostgres(
    `
    update public.ai_agent_workflows
    set run_mode = 'auto_allowed',
        output_policy_json = output_policy_json || jsonb_build_object(
          'mode', 'auto_allowed',
          'customerSendsControlledSeparately', true,
          'publicPublishingControlledSeparately', true,
          'financialAuthorityControlledSeparately', true
        ),
        updated_at = now()
    where tenant_id = $1 and status <> 'archived'
    `,
    [tenantId]
  );

  if (!existingMembership?.rows[0]) {
    inviteToken = randomSessionToken();
    await queryPostgres(
      `
      insert into public.workspace_invites (
        tenant_id, email, role, status, invite_token_hash, expires_at, updated_at
      )
      values ($1, lower($2), 'owner', 'pending', $3, now() + interval '14 days', now())
      on conflict (tenant_id, email) do update
      set role = 'owner',
          status = 'pending',
          invite_token_hash = excluded.invite_token_hash,
          expires_at = excluded.expires_at,
          revoked_at = null,
          updated_at = now()
      `,
      [tenantId, input.email, hashSessionToken(inviteToken)]
    );
  }

  await queryPostgres(
    `
    update public.access_requests
    set status = $2,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where id = $1
    `,
    [
      input.accessRequestId,
      inviteToken ? "invited" : "reviewing",
      JSON.stringify({
        checkoutStatus: "paid_and_provisioned",
        workspaceId: tenantId,
        workspaceSlug,
        stripeEventId: input.stripeEventId,
        stripeCheckoutSessionId: input.checkoutSessionId,
        inviteCreated: Boolean(inviteToken)
      })
    ]
  );

  const activationUrl = inviteToken ? appUrl(`/invite/${inviteToken}`) : appUrl("/login");
  await sendTransactionalEmail({
    to: input.email,
    subject: "Activate your Ferocity account",
    text: `Hi${input.buyerName ? ` ${input.buyerName}` : ""},

Your ${input.companyName} Ferocity subscription is active.

${inviteToken ? "Create your password and activate the workspace:" : "Your existing Ferocity account has been upgraded. Sign in here:"}
${activationUrl}

Start with guided setup. Customer messages, calls, publishing, ad spend, and connected-provider actions remain off until you configure and approve them.`,
    tenantId,
    eventKey: "paid_workspace_activation",
    metadata: {
      accessRequestId: input.accessRequestId,
      planKey: input.planKey,
      subscriptionId: input.subscriptionId
    }
  });

  return {
    tenantId,
    workspaceSlug,
    status: inviteToken ? ("invite_sent" as const) : ("existing_account_upgraded" as const)
  };
}
