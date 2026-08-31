import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { evaluateManagedAdSpend, getManagedAdBudgetControls, type ManagedAdBudgetControl } from "@/lib/marketing-os/managed-ad-spend";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type BillingPlanRow = {
  id: string;
  planKey: string;
  name: string;
  monthlyPriceCents: number;
  includedBrands: number;
  includedAiRuns: number;
};

export type RebillingPolicyRow = {
  planKey: string | null;
  feeKey: string;
  feeFamily: string;
  feeLabel: string;
  appliesWhen: string;
  feeType: string;
  percentageBps: number;
  flatFeeCents: number;
  monthlyCapCents: number | null;
  included: boolean;
  required: boolean;
  status: string;
  disclosure: string;
};

export type UsageChargeRow = {
  id: string;
  chargeKey: string;
  feeFamily: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  stripeInvoiceItemId: string | null;
  lastError: string | null;
  createdAt: string;
};

export type BillingOverview = {
  subscription: {
    planKey: string;
    status: string;
    seats: number;
    currentPeriodEnd: string;
    hasStripeCustomer: boolean;
  } | null;
  plans: BillingPlanRow[];
  usage: {
    brands: number;
    users: number;
    leadsThisMonth: number;
    activeForms: number;
    aiRunsThisMonth: number;
    seoDraftsThisMonth: number;
    publishingQueueItems: number;
    reviewRequestsThisMonth: number;
    followUpsOpen: number;
    laborRequestsThisMonth: number;
    workerIntakeThisMonth: number;
    laborMatchesThisMonth: number;
  };
  featureGates: {
    featureKey: string;
    status: string;
    usageLimit: number | null;
    usagePeriod: string | null;
    currentUsage: number;
    remaining: number | null;
    label: string;
  }[];
  rebillingPolicies: RebillingPolicyRow[];
  usageCharges: {
    pendingReviewCents: number;
    approvedCents: number;
    queuedCents: number;
    recent: UsageChargeRow[];
  };
  managedVoice: {
    includedMinutes: number;
    usedMinutes: number;
    overageUnitPriceCents: number;
    optionalMonthlyChargeLimitCents: number | null;
  } | null;
  storage: {
    usedBytes: number;
    maxBytes: number;
    remainingBytes: number;
    percentUsed: number;
  };
  managedAdBudgets: Array<ManagedAdBudgetControl & {
    readinessStatus: string;
    readinessReason: string;
  }>;
  readiness: {
    label: string;
    status: "ready" | "needs_setup" | "blocked";
    detail: string;
  }[];
};

export async function getBillingOverview(): Promise<BillingOverview> {
  const workspaceId = await getCurrentWorkspaceId();
  const [subscription, plans, usageResult, gatesResult, stripeResult, connectResult, rebillingResult, usageChargesResult, usageChargeSummaryResult, storageResult, voiceResult, managedAdBudgets] = await Promise.all([
    queryPostgres<{ plan_key: string; status: string; seats: number; current_period_end: Date | null; external_customer_ref: string | null }>(
      "select plan_key, status, seats, current_period_end, external_customer_ref from public.billing_subscriptions where tenant_id = $1 limit 1",
      [workspaceId]
    ),
    queryPostgres<{ id: string; plan_key: string; name: string; monthly_price_cents: number; included_brands: number; included_ai_runs: number }>(
      "select id, plan_key, name, monthly_price_cents, included_brands, included_ai_runs from public.billing_plans where active = true order by monthly_price_cents",
      []
    ),
    queryPostgres<{
      brands: string;
      users: string;
      leads_this_month: string;
      active_forms: string;
      ai_runs_this_month: string;
      seo_drafts_this_month: string;
      publishing_queue_items: string;
      review_requests_this_month: string;
      followups_open: string;
      labor_requests_this_month: string;
      worker_intake_this_month: string;
      labor_matches_this_month: string;
    }>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status = 'active') as brands,
        (select count(*) from public.tenant_users where tenant_id = $1) as users,
        (select count(*) from public.leads where tenant_id = $1 and created_at >= date_trunc('month', now())) as leads_this_month,
        (select count(*) from public.forms where tenant_id = $1 and active = true) as active_forms,
        (select count(*) from public.ai_generation_runs where tenant_id = $1 and created_at >= date_trunc('month', now())) as ai_runs_this_month,
        (
          select count(*) from public.ai_drafts
          where tenant_id = $1 and content_type in ('blog', 'city_page', 'service_page', 'gbp_post')
            and created_at >= date_trunc('month', now())
        ) as seo_drafts_this_month,
        (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status <> 'canceled') as publishing_queue_items,
        (
          select count(*) from public.review_request_workflows
          where tenant_id = $1 and created_at >= date_trunc('month', now())
        ) as review_requests_this_month,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open', 'scheduled', 'missed')) as followups_open,
        (select count(*) from public.labor_staffing_requests where tenant_id = $1 and created_at >= date_trunc('month', now())) as labor_requests_this_month,
        (select count(*) from public.labor_worker_availability where tenant_id = $1 and source = 'public_form' and created_at >= date_trunc('month', now())) as worker_intake_this_month,
        (select count(*) from public.labor_staffing_matches where tenant_id = $1 and created_at >= date_trunc('month', now())) as labor_matches_this_month
      `,
      [workspaceId]
    ),
    queryPostgres<{
      feature_key: string;
      status: string;
      usage_limit: number | null;
      usage_period: string | null;
      metadata_json: { description?: string } | null;
    }>(
      `
      select feature_key, status, usage_limit, usage_period, metadata_json
      from public.workspace_feature_entitlements
      where tenant_id = $1
      order by feature_key
      `,
      [workspaceId]
    ),
    queryPostgres<{ status: string; credentials_status: string }>(
      `
      select status, credentials_status
      from public.integration_connections
      where tenant_id = $1 and provider = 'stripe'
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      account_status: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      provider_account_id: string | null;
    }>(
      `
      select account_status, charges_enabled, payouts_enabled, provider_account_id
      from public.payment_provider_accounts
      where tenant_id = $1
        and provider = 'stripe'
        and payment_mode = 'ferocity_managed_connect'
        and provider_account_id is not null
      order by updated_at desc
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      plan_key: string | null;
      fee_key: string;
      fee_family: string;
      fee_label: string;
      applies_when: string;
      fee_type: string;
      percentage_bps: number;
      flat_fee_cents: number;
      monthly_cap_cents: number | null;
      included: boolean;
      required: boolean;
      status: string;
      disclosure: string;
    }>(
      `
      select
        plan_key,
        fee_key,
        fee_family,
        fee_label,
        applies_when,
        fee_type,
        percentage_bps,
        flat_fee_cents,
        monthly_cap_cents,
        included,
        required,
        status,
        disclosure
      from public.rebilling_markup_policies
      where tenant_id is null or tenant_id = $1
      order by
        case fee_family
          when 'tracked_growth' then 1
          when 'managed_payments' then 2
          when 'managed_marketing' then 3
          else 4
        end,
        plan_key nulls first,
        fee_key
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      charge_key: string;
      fee_family: string;
      description: string;
      amount_cents: number;
      currency: string;
      status: string;
      stripe_invoice_item_id: string | null;
      last_error: string | null;
      created_at: Date;
    }>(
      `
      select id, charge_key, fee_family, description, amount_cents, currency, status, stripe_invoice_item_id, last_error, created_at
      from public.billing_usage_charges
      where tenant_id = $1
      order by created_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      pending_review_cents: string | null;
      approved_cents: string | null;
      queued_cents: string | null;
    }>(
      `
      select
        coalesce(sum(amount_cents) filter (where status = 'pending_review'), 0)::text as pending_review_cents,
        coalesce(sum(amount_cents) filter (where status = 'approved'), 0)::text as approved_cents,
        coalesce(sum(amount_cents) filter (where status = 'queued_for_invoice'), 0)::text as queued_cents
      from public.billing_usage_charges
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{ used_bytes: string; max_bytes: string }>(
      `
      select
        coalesce((
          select sum(byte_count)
          from public.storage_usage_events
          where tenant_id = $1 and status in ('reserved','active')
        ), 0)::text as used_bytes,
        coalesce((
          select max_bytes
          from public.storage_quota_policies
          where tenant_id = $1 and status = 'active'
          limit 1
        ), 0)::text as max_bytes
      `,
      [workspaceId]
    ),
    queryPostgres<{
      included_quantity: string | number;
      overage_unit_price_cents: string | number;
      used_minutes: string | number;
      monthly_customer_charge_cap_cents: string | number | null;
    }>(
      `
      with tenant_plan as (
        select coalesce(s.plan_key, t.plan_key, 'free') as plan_key
        from public.tenants t
        left join public.billing_subscriptions s on s.tenant_id = t.id
        where t.id = $1
      ), policy as (
        select p.included_quantity, p.overage_unit_price_cents
        from public.usage_allowance_policies p, tenant_plan tp
        where p.feature_key = 'ai_receptionist'
          and p.unit_type = 'minute'
          and p.status = 'active'
          and tp.plan_key in ('calls', 'starter', 'growth', 'operator', 'managed_operator')
          and p.overage_unit_price_cents > 0
          and (p.tenant_id = $1 or (p.tenant_id is null and p.plan_key = tp.plan_key))
        order by (p.tenant_id is not null) desc
        limit 1
      )
      select
        p.included_quantity,
        p.overage_unit_price_cents,
        coalesce((
          select sum(u.quantity)
          from public.usage_meter_events u
          where u.tenant_id = $1
            and u.feature_key = 'ai_receptionist'
            and u.unit_type = 'minute'
            and u.billing_period_start = date_trunc('month', now())::date
            and u.status not in ('void', 'failed')
        ), 0) as used_minutes,
        l.monthly_customer_charge_cap_cents
      from policy p
      left join public.spend_limits l
        on l.tenant_id = $1
       and l.scope_type = 'feature'
       and l.scope_key = 'ai_receptionist'
       and l.status = 'active'
      limit 1
      `,
      [workspaceId]
    ),
    getManagedAdBudgetControls(workspaceId)
  ]);
  const sub = subscription?.rows[0];
  const usageRow = usageResult?.rows[0];
  const usage = {
    brands: Number(usageRow?.brands ?? 0),
    users: Number(usageRow?.users ?? 0),
    leadsThisMonth: Number(usageRow?.leads_this_month ?? 0),
    activeForms: Number(usageRow?.active_forms ?? 0),
    aiRunsThisMonth: Number(usageRow?.ai_runs_this_month ?? 0),
    seoDraftsThisMonth: Number(usageRow?.seo_drafts_this_month ?? 0),
    publishingQueueItems: Number(usageRow?.publishing_queue_items ?? 0),
    reviewRequestsThisMonth: Number(usageRow?.review_requests_this_month ?? 0),
    followUpsOpen: Number(usageRow?.followups_open ?? 0),
    laborRequestsThisMonth: Number(usageRow?.labor_requests_this_month ?? 0),
    workerIntakeThisMonth: Number(usageRow?.worker_intake_this_month ?? 0),
    laborMatchesThisMonth: Number(usageRow?.labor_matches_this_month ?? 0)
  };
  const usageForFeature = (featureKey: string) => {
    if (featureKey === "seo_autopilot") return usage.seoDraftsThisMonth;
    if (featureKey === "publishing_queue") return usage.publishingQueueItems;
    if (featureKey === "review_requests") return usage.reviewRequestsThisMonth;
    if (featureKey === "follow_up_recovery") return usage.followUpsOpen;
    if (featureKey === "labor_staffing_requests") return usage.laborRequestsThisMonth;
    if (featureKey === "labor_worker_intake") return usage.workerIntakeThisMonth;
    if (featureKey === "labor_match_suggestions") return usage.laborMatchesThisMonth;
    return 0;
  };
  const stripe = stripeResult?.rows[0];
  const connect = connectResult?.rows[0];
  const usageChargeSummary = usageChargeSummaryResult?.rows[0];
  const storage = storageResult?.rows[0];
  const voice = voiceResult?.rows[0];
  const usedBytes = Number(storage?.used_bytes ?? 0);
  const maxBytes = Number(storage?.max_bytes ?? 0);
  const managedPaymentsEnabled = env.FEROCITY_MANAGED_PAYMENTS_ENABLED === "true";
  const managedPaymentsFeeBps = Number(env.FEROCITY_MANAGED_PAYMENT_FEE_BPS ?? 150);
  const usageBillingEnabled = env.FEROCITY_USAGE_BILLING_ENABLED === "true";
  const connectReady = managedPaymentsEnabled && connect?.account_status === "connected" && connect.charges_enabled && connect.payouts_enabled;

  return {
    subscription: sub
      ? {
          planKey: sub.plan_key,
          status: sub.status,
          seats: sub.seats,
          currentPeriodEnd: sub.current_period_end?.toISOString() ?? "",
          hasStripeCustomer: Boolean(sub.external_customer_ref)
        }
      : null,
    plans: (plans?.rows ?? []).map((plan) => ({
      id: plan.id,
      planKey: plan.plan_key,
      name: plan.name,
      monthlyPriceCents: plan.monthly_price_cents,
      includedBrands: plan.included_brands,
      includedAiRuns: plan.included_ai_runs
    })),
    usage,
    featureGates: (gatesResult?.rows ?? []).map((gate) => {
      const currentUsage = usageForFeature(gate.feature_key);
      return {
        featureKey: gate.feature_key,
        status: gate.status,
        usageLimit: gate.usage_limit,
        usagePeriod: gate.usage_period,
        currentUsage,
        remaining: gate.usage_limit === null ? null : Math.max(gate.usage_limit - currentUsage, 0),
        label: gate.metadata_json?.description ?? gate.feature_key.replaceAll("_", " ")
      };
    }),
    rebillingPolicies: (rebillingResult?.rows ?? []).map((policy) => ({
      planKey: policy.plan_key,
      feeKey: policy.fee_key,
      feeFamily: policy.fee_family,
      feeLabel: policy.fee_label,
      appliesWhen: policy.applies_when,
      feeType: policy.fee_type,
      percentageBps: Number(policy.percentage_bps ?? 0),
      flatFeeCents: Number(policy.flat_fee_cents ?? 0),
      monthlyCapCents: policy.monthly_cap_cents === null ? null : Number(policy.monthly_cap_cents),
      included: policy.included,
      required: policy.required,
      status: policy.status,
      disclosure: policy.disclosure
    })),
    usageCharges: {
      pendingReviewCents: Number(usageChargeSummary?.pending_review_cents ?? 0),
      approvedCents: Number(usageChargeSummary?.approved_cents ?? 0),
      queuedCents: Number(usageChargeSummary?.queued_cents ?? 0),
      recent: (usageChargesResult?.rows ?? []).map((charge) => ({
        id: charge.id,
        chargeKey: charge.charge_key,
        feeFamily: charge.fee_family,
        description: charge.description,
        amountCents: Number(charge.amount_cents ?? 0),
        currency: charge.currency,
        status: charge.status,
        stripeInvoiceItemId: charge.stripe_invoice_item_id,
        lastError: charge.last_error,
        createdAt: charge.created_at?.toISOString() ?? ""
      }))
    },
    managedVoice: voice
      ? {
          includedMinutes: Number(voice.included_quantity ?? 0),
          usedMinutes: Number(voice.used_minutes ?? 0),
          overageUnitPriceCents: Number(voice.overage_unit_price_cents ?? 0),
          optionalMonthlyChargeLimitCents:
            voice.monthly_customer_charge_cap_cents === null
              ? null
              : Number(voice.monthly_customer_charge_cap_cents)
        }
      : null,
    storage: {
      usedBytes,
      maxBytes,
      remainingBytes: Math.max(0, maxBytes - usedBytes),
      percentUsed: maxBytes > 0 ? Math.min(100, Math.round((usedBytes / maxBytes) * 100)) : 0
    },
    managedAdBudgets: managedAdBudgets.map((budget) => {
      const decision = evaluateManagedAdSpend(budget, Math.min(Math.max(budget.dailyCapCents, 0), Math.max(budget.availableCents, 0)));
      return {
        ...budget,
        readinessStatus: decision.status,
        readinessReason: decision.reason
      };
    }),
    readiness: [
      {
        label: "Stripe connection",
        status: stripe?.status === "connected" && stripe.credentials_status === "configured" ? "ready" : "needs_setup",
        detail: stripe?.status === "connected" ? "Stripe is marked connected." : "Add Stripe keys and webhook secret before paid subscriptions are live."
      },
      {
        label: "Stripe Connect managed payments",
        status: connectReady ? "ready" : "needs_setup",
        detail:
          connectReady
            ? `Managed payments are enabled with a ${Number.isFinite(managedPaymentsFeeBps) ? managedPaymentsFeeBps / 100 : 1.5}% platform-fee target. Confirm Connect onboarding and fee pass-through before live use.`
            : connect?.provider_account_id
              ? `Stripe Connect account is ${connect.account_status}. Finish onboarding before Ferocity routes customer payments to this business.`
              : "Managed payments are not live. Use manual tracking until Stripe Connect onboarding, fee policy, payout, dispute, and webhook handling are finished."
      },
      {
        label: "Usage and markup billing",
        status: usageBillingEnabled ? (sub?.external_customer_ref ? "ready" : "needs_setup") : "needs_setup",
        detail: usageBillingEnabled
          ? sub?.external_customer_ref
            ? "Approved usage and markup charges can be attached to the next Stripe subscription invoice."
            : "Usage billing is enabled, but this workspace needs a Stripe customer first."
          : "Usage billing is staged but disabled. Set FEROCITY_USAGE_BILLING_ENABLED=true only after fee disclosure and charge review are ready."
      },
      {
        label: "Managed ad spend controls",
        status: managedAdBudgets.some(
          (budget) =>
            budget.liveSpendEnabled &&
            budget.approvedByCustomer &&
            budget.providerFundingReady &&
            budget.availableCents > 0 &&
            budget.dailyCapCents > 0 &&
            budget.monthlyCapCents > 0
        )
          ? "ready"
          : "needs_setup",
        detail: managedAdBudgets.length
          ? "Managed ad lanes are separate from customer-owned accounts. Live spend requires customer prepaid funds, approval, automatic safety boundaries, an emergency stop, and a current linked provider balance. Customers may add or remove their own tighter limits."
          : "Apply the managed ad spend controls migration before offering Ferocity-managed ad buying."
      },
      {
        label: "Subscription record",
        status: sub ? "ready" : "needs_setup",
        detail: sub ? `Workspace is on ${sub.plan_key}.` : "Create a subscription record before enforcing plan limits."
      },
      {
        label: "Plan limits",
        status: plans?.rows?.length ? "ready" : "blocked",
        detail: plans?.rows?.length ? "Plans are available for gating." : "No active billing plans are configured."
      }
    ]
  };
}
