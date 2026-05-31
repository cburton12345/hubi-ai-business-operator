import { queryPostgres } from "@/lib/db/postgres";

export type IntakeLimitStatus =
  | {
      ok: true;
      planKey: string;
      monthlyLeadLimit: number | null;
      monthlyLeadsUsed: number;
      formsLimit: number | null;
      activeForms: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
      reason: "lead_limit" | "form_limit";
      planKey: string;
      monthlyLeadLimit: number | null;
      monthlyLeadsUsed: number;
      formsLimit: number | null;
      activeForms: number;
    };

type LimitRow = {
  plan_key: string | null;
  monthly_lead_limit: number | null;
  monthly_leads_used: string;
  forms_limit: number | null;
  active_forms: string;
};

function limitForPlan(planKey: string | null) {
  if (planKey === "free") {
    return { monthlyLeadLimit: 25, formsLimit: 1 };
  }

  if (planKey === "starter") {
    return { monthlyLeadLimit: 250, formsLimit: 3 };
  }

  if (planKey === "growth") {
    return { monthlyLeadLimit: 1000, formsLimit: 10 };
  }

  return { monthlyLeadLimit: null, formsLimit: null };
}

export async function checkLeadIntakeLimits(tenantId: string): Promise<IntakeLimitStatus> {
  const result = await queryPostgres<LimitRow>(
    `
    select
      coalesce(
        (select plan_key from public.billing_subscriptions where tenant_id = $1 limit 1),
        (select plan_key from public.tenants where id = $1 limit 1),
        'free'
      ) as plan_key,
      (select count(*) from public.leads where tenant_id = $1 and created_at >= date_trunc('month', now()))::text as monthly_leads_used,
      (select count(*) from public.forms where tenant_id = $1 and active = true)::text as active_forms,
      null::int as monthly_lead_limit,
      null::int as forms_limit
    `,
    [tenantId]
  );

  const row = result?.rows[0];
  const planKey = row?.plan_key ?? "free";
  const limits = limitForPlan(planKey);
  const monthlyLeadsUsed = Number(row?.monthly_leads_used ?? 0);
  const activeForms = Number(row?.active_forms ?? 0);

  if (limits.monthlyLeadLimit !== null && monthlyLeadsUsed >= limits.monthlyLeadLimit) {
    return {
      ok: false,
      status: 402,
      error: "This workspace has reached its monthly lead limit. Upgrade or archive test traffic before accepting more leads.",
      reason: "lead_limit",
      planKey,
      monthlyLeadLimit: limits.monthlyLeadLimit,
      monthlyLeadsUsed,
      formsLimit: limits.formsLimit,
      activeForms
    };
  }

  if (limits.formsLimit !== null && activeForms > limits.formsLimit) {
    return {
      ok: false,
      status: 402,
      error: "This workspace has more active forms than the current plan allows. Pause extra forms or upgrade the plan.",
      reason: "form_limit",
      planKey,
      monthlyLeadLimit: limits.monthlyLeadLimit,
      monthlyLeadsUsed,
      formsLimit: limits.formsLimit,
      activeForms
    };
  }

  return {
    ok: true,
    planKey,
    monthlyLeadLimit: limits.monthlyLeadLimit,
    monthlyLeadsUsed,
    formsLimit: limits.formsLimit,
    activeForms
  };
}
