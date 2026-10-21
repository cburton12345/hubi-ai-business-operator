import { ensureDefaultAgentWorkflows } from "@/lib/ai-workforce/agent-workflows";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";
import { getDefaultPushNotificationPreferences, upsertPushNotificationPreferences } from "@/lib/push/preferences";
import type { SelfServePlanKey } from "@/lib/billing/public-plans";
import { inheritedServiceFeaturesForPlan } from "@/lib/billing/apply-plan-entitlements";
import { syncCustomerOnboardingForTenant } from "@/lib/onboarding/customer-onboarding";
import type { QueryResultRow } from "pg";

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

async function requirePostgres<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[],
  safeError: string
) {
  const result = await queryPostgres<T>(sql, values);
  if (!result) throw new Error(safeError);
  return result;
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

type ProvisionTarget = {
  tenantId: string;
  workspaceSlug: string;
  hasActiveMembership: boolean;
  ensureFoundation: boolean;
  alreadyProvisioned: boolean;
};

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function resolveProvisionTarget(input: ProvisionPaidWorkspaceInput): Promise<ProvisionTarget> {
  const resolved = await withPostgresTransactionResult<ProvisionTarget>(async (client) => {
    // Serialize every retry or duplicate Stripe event for the same subscription.
    // The lock is transaction-scoped and cannot leak after commit/rollback.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`ferocity-paid-workspace:${input.subscriptionId}`]);

    const accessRequest = await client.query<{
      status: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
      select status, metadata_json
      from public.access_requests
      where id = $1
        and lower(email) = lower($2)
      for update
      `,
      [input.accessRequestId, input.email]
    );
    const request = accessRequest.rows[0];
    if (!request) {
      throw new Error("The paid signup could not be matched to its verified access request.");
    }

    const priorSubscription = await client.query<{ tenant_id: string }>(
      `
      select tenant_id
      from public.billing_subscriptions
      where external_subscription_ref = $1
      limit 1
      `,
      [input.subscriptionId]
    );

    const metadataWorkspaceId = metadataText(request.metadata_json, "workspaceId");
    const candidateTenantId = metadataWorkspaceId ?? priorSubscription.rows[0]?.tenant_id ?? null;
    const candidateWorkspace = candidateTenantId
      ? await client.query<{ id: string; slug: string }>(
          `
          select id, slug
          from public.tenants
          where id = $1
            and status <> 'archived'
            and account_type = 'customer'
          limit 1
          `,
          [candidateTenantId]
        )
      : null;

    const completed = metadataText(request.metadata_json, "checkoutStatus") === "paid_and_provisioned";
    if (completed && priorSubscription.rows[0] && candidateWorkspace?.rows[0]) {
      return {
        tenantId: candidateWorkspace.rows[0].id,
        workspaceSlug: candidateWorkspace.rows[0].slug,
        hasActiveMembership: request.status === "reviewing",
        ensureFoundation: false,
        alreadyProvisioned: true
      };
    }

    const existingMembership = (
      await client.query<{ tenant_id: string; slug: string }>(
        `
        select tu.tenant_id, t.slug
        from public.users u
        join public.tenant_users tu on tu.user_id = u.id and tu.status = 'active'
        join public.tenants t on t.id = tu.tenant_id and t.status <> 'archived' and t.account_type = 'customer'
        where lower(u.email) = lower($1)
          and ($2::uuid is null or t.id = $2::uuid)
        order by tu.updated_at desc nulls last, tu.created_at desc
        limit 1
        `,
        [input.email, candidateWorkspace?.rows[0]?.id ?? null]
      )
    ).rows[0] ?? null;

    const existingInvite = candidateWorkspace?.rows[0] || existingMembership
      ? null
      : (
          await client.query<{ tenant_id: string; slug: string }>(
            `
            select wi.tenant_id, t.slug
            from public.workspace_invites wi
            join public.tenants t on t.id = wi.tenant_id and t.status <> 'archived' and t.account_type = 'customer'
            where lower(wi.email) = lower($1)
            order by wi.updated_at desc nulls last, wi.created_at desc
            limit 1
            `,
            [input.email]
          )
        ).rows[0] ?? null;

    let tenantId = candidateWorkspace?.rows[0]?.id ?? existingMembership?.tenant_id ?? existingInvite?.tenant_id ?? null;
    let workspaceSlug = candidateWorkspace?.rows[0]?.slug ?? existingMembership?.slug ?? existingInvite?.slug ?? null;
    let createdWorkspace = false;

    if (!tenantId || !workspaceSlug) {
      const workspaceName = input.companyName.trim();
      const baseSlug = slugify(workspaceName) || "ferocity-business";
      workspaceSlug = `${baseSlug}-${randomSessionToken().slice(0, 6).toLowerCase()}`;
      const workspace = await client.query<{ id: string }>(
        `
        insert into public.tenants (
          name, slug, account_type, status, billing_status, plan_key, onboarding_status
        )
        values ($1, $2, 'customer', 'active', 'active', $3, 'not_started')
        returning id
        `,
        [workspaceName, workspaceSlug, input.planKey]
      );
      tenantId = workspace.rows[0]?.id ?? null;
      if (!tenantId) throw new Error("Stripe payment succeeded but the Ferocity workspace could not be created.");
      createdWorkspace = true;
    }

    await client.query(
      `
      update public.access_requests
      set status = 'reviewing',
          metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where id = $1
        and lower(email) = lower($2)
      `,
      [
        input.accessRequestId,
        input.email,
        JSON.stringify({
          checkoutStatus: "provisioning",
          workspaceId: tenantId,
          workspaceSlug,
          subscriptionId: input.subscriptionId,
          stripeEventId: input.stripeEventId,
          stripeCheckoutSessionId: input.checkoutSessionId
        })
      ]
    );

    return {
      tenantId,
      workspaceSlug,
      hasActiveMembership: Boolean(existingMembership),
      ensureFoundation: createdWorkspace || Boolean(candidateWorkspace?.rows[0] && !existingMembership),
      alreadyProvisioned: false
    };
  });

  if (!resolved.ok) throw resolved.error;
  return resolved.value;
}

async function ensureWorkspaceFoundation(input: {
  tenantId: string;
  workspaceSlug: string;
  workspaceName: string;
  email: string;
}) {
  const existingBrand = await requirePostgres<{ id: string }>(
    `
    select id
    from public.brands
    where tenant_id = $1 and status = 'active'
    order by created_at
    limit 1
    `,
    [input.tenantId],
    "The paid workspace brand state could not be verified."
  );
  let brandId = existingBrand?.rows[0]?.id ?? null;

  if (!brandId) {
    const brandSlug = slugify(input.workspaceName) || "main-brand";
    const brand = await requirePostgres<{ id: string }>(
      `
      insert into public.brands (
        tenant_id, name, slug, email, business_model, description, primary_goal, risk_profile, status
      )
      values ($1, $2, $3, lower($4), 'local_service', 'Created after verified Ferocity subscription checkout.',
        'Complete guided setup and choose the first business outcome.', 'normal', 'active')
      returning id
      `,
      [input.tenantId, input.workspaceName, brandSlug, input.email],
      "Stripe payment succeeded but the Ferocity brand could not be created."
    );
    brandId = brand?.rows[0]?.id ?? null;
  }
  if (!brandId) throw new Error("Stripe payment succeeded but the Ferocity brand could not be created.");

  await requirePostgres(
    `
    insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
    values ($1, $2, 'Primary service', 'primary-service', 'Complete guided setup to customize this service.', 100, true)
    on conflict (brand_id, slug) do nothing
    `,
    [input.tenantId, brandId],
    "The paid workspace primary service could not be provisioned."
  );
  await requirePostgres(
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
    [input.tenantId, brandId],
    "The paid workspace marketing controls could not be provisioned."
  );
  await requirePostgres(
    `
    insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
    values ($1, $2, 'Primary Lead Form', 'primary-lead-form', $3, true)
    on conflict (brand_id, slug) do nothing
    `,
    [input.tenantId, brandId, `${input.workspaceSlug}-lead-${randomSessionToken().slice(0, 10).toLowerCase()}`],
    "The paid workspace lead intake could not be provisioned."
  );

  await ensureDefaultAgentWorkflows(input.tenantId);
  await upsertPushNotificationPreferences(input.tenantId, getDefaultPushNotificationPreferences());
}

export async function provisionPaidWorkspace(input: ProvisionPaidWorkspaceInput) {
  const inheritedServiceFeatures = inheritedServiceFeaturesForPlan(input.planKey);
  const target = await resolveProvisionTarget(input);
  if (target.alreadyProvisioned) {
    return {
      tenantId: target.tenantId,
      workspaceSlug: target.workspaceSlug,
      status: "already_provisioned" as const
    };
  }

  const tenantId = target.tenantId;
  const workspaceSlug = target.workspaceSlug;
  let inviteToken: string | null = null;

  if (target.ensureFoundation) {
    await ensureWorkspaceFoundation({
      tenantId,
      workspaceSlug,
      workspaceName: input.companyName.trim(),
      email: input.email
    });
  } else {
    await requirePostgres(
      `
      update public.tenants
      set plan_key = $2,
          billing_status = 'active',
          status = 'active',
          updated_at = now()
      where id = $1
      `,
      [tenantId, input.planKey],
      "The existing customer workspace could not be upgraded."
    );
  }

  await requirePostgres(
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
    ],
    "The paid subscription could not be recorded in Ferocity."
  );

  await requirePostgres(
    `
    with selected_features as (
      select feature_key, metadata_json, 0 as source_priority
      from public.plan_feature_matrix
      where plan_key = $2 and included = true
      union all
      select feature_key, '{}'::jsonb, 1
      from unnest($3::text[]) feature_key
    ), deduplicated as (
      select distinct on (feature_key) feature_key, metadata_json
      from selected_features
      order by feature_key, source_priority
    )
    insert into public.workspace_feature_entitlements (
      tenant_id, feature_key, status, usage_limit, usage_period, metadata_json, updated_at
    )
    select
      $1, feature_key, 'enabled', null, 'monthly',
      metadata_json || jsonb_build_object('provisionedFromPlan', $2::text, 'inheritedServiceFeature', true), now()
    from deduplicated
    on conflict (tenant_id, feature_key) do update
    set status = 'enabled',
        metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [tenantId, input.planKey, inheritedServiceFeatures],
    "The paid plan entitlements could not be provisioned."
  );

  if (["starter", "growth", "operator"].includes(input.planKey)) {
    const includedWeeklyPublishingMoments = input.planKey === "starter" ? 2 : input.planKey === "growth" ? 4 : 7;
    await requirePostgres(
      `
      update public.workspace_feature_entitlements
      set usage_limit = $2,
          usage_period = 'weekly',
          metadata_json = metadata_json || jsonb_build_object(
            'includedWeeklyPublishingMoments', $2::int,
            'approvalMode', 'review_required',
            'overagePolicy', 'block',
            'organicOnly', true,
            'paidSpendSeparate', true,
            'requiresExplicitOptIn', true,
            'qualityGateRequired', true
          ),
          updated_at = now()
      where tenant_id = $1 and feature_key = 'publishing_queue'
      `,
      [tenantId, includedWeeklyPublishingMoments],
      "The paid publishing allowance could not be provisioned."
    );
  }

  await requirePostgres(
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
    ],
    "The paid workspace service controls could not be provisioned."
  );

  await requirePostgres(
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
    [tenantId],
    "The paid workspace agent controls could not be provisioned."
  );

  await syncCustomerOnboardingForTenant(tenantId);

  if (!target.hasActiveMembership) {
    inviteToken = randomSessionToken();
    await requirePostgres(
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
      [tenantId, input.email, hashSessionToken(inviteToken)],
      "The paid workspace owner invitation could not be created."
    );
  }

  const activationUrl = inviteToken ? appUrl(`/invite/${inviteToken}`) : appUrl("/login");
  const activationEmail = await sendTransactionalEmail({
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
  if (!activationEmail.ok) {
    throw new Error("The paid workspace was created, but its activation email could not be delivered yet.");
  }

  await requirePostgres(
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
        inviteCreated: Boolean(inviteToken),
        activationEmailDelivered: true
      })
    ],
    "The paid workspace activation could not be finalized."
  );

  await raisePlatformAdminAlert({
    fingerprint: `paid-subscription:${input.subscriptionId}`,
    family: "customer_growth",
    type: "subscription_paid",
    severity: "high",
    title: `New paid Ferocity subscriber: ${input.companyName}`,
    body: `${input.companyName} paid for the ${input.planKey} plan. The workspace is active${inviteToken ? " and the owner invitation was sent" : " on the existing owner account"}.`,
    tenantId,
    actionUrl: "/app/access-requests",
    metadata: {
      accessRequestId: input.accessRequestId,
      planKey: input.planKey,
      subscriptionId: input.subscriptionId,
      customerEmail: input.email,
      workspaceSlug
    }
  });

  return {
    tenantId,
    workspaceSlug,
    status: inviteToken ? ("invite_sent" as const) : ("existing_account_upgraded" as const)
  };
}
