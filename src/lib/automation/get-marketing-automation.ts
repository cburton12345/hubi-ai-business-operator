import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const automationDefaults = [
  { type: "recurring_seo_post", cadence: "weekly" },
  { type: "gbp_post", cadence: "weekly" },
  { type: "facebook_post", cadence: "weekly" },
  { type: "review_request_campaign", cadence: "weekly" },
  { type: "follow_up_sequence", cadence: "on_lead_created" },
  { type: "nurture_message", cadence: "biweekly" },
  { type: "reporting_summary", cadence: "weekly" }
] as const;

export type MarketingAutomationRuleRow = {
  id: string;
  brandName: string;
  automationType: string;
  cadence: string;
  status: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type MarketingAutomationRunRow = {
  id: string;
  brandName: string;
  automationType: string;
  status: string;
  summary: string;
  createdAt: string;
};

export async function ensureMarketingAutomationRules() {
  const workspaceId = await getCurrentWorkspaceId();
  const brands = await queryPostgres<{ id: string; business_model: string }>(
    "select id, business_model from public.brands where tenant_id = $1 and status = 'active'",
    [workspaceId]
  );

  for (const brand of brands?.rows ?? []) {
    for (const rule of automationDefaults) {
      await queryPostgres(
        `
        insert into public.marketing_automation_rules (
          tenant_id,
          brand_id,
          automation_type,
          cadence,
          settings_json,
          next_run_at
        )
        values ($1, $2, $3, $4, $5::jsonb, now())
        on conflict (brand_id, automation_type) do nothing
        `,
        [
          workspaceId,
          brand.id,
          rule.type,
          rule.cadence,
          JSON.stringify({
            businessModel: brand.business_model,
            createsDraftsOnly: true,
            requiresManualApprovalBeforePublishing: true
          })
        ]
      );
    }
  }
}

export async function getMarketingAutomationRuleRows(): Promise<MarketingAutomationRuleRow[]> {
  await ensureMarketingAutomationRules();
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    automation_type: string;
    cadence: string;
    status: string;
    next_run_at: Date | null;
    last_run_at: Date | null;
  }>(
    `
    select r.id, b.name as brand_name, r.automation_type, r.cadence, r.status, r.next_run_at, r.last_run_at
    from public.marketing_automation_rules r
    join public.brands b on b.id = r.brand_id
    where r.tenant_id = $1
    order by b.name, r.automation_type
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    automationType: row.automation_type,
    cadence: row.cadence,
    status: row.status,
    nextRunAt: row.next_run_at?.toISOString() ?? null,
    lastRunAt: row.last_run_at?.toISOString() ?? null
  }));
}

export async function getMarketingAutomationRunRows(): Promise<MarketingAutomationRunRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string | null;
    automation_type: string;
    status: string;
    summary: string;
    created_at: Date;
  }>(
    `
    select r.id, b.name as brand_name, r.automation_type, r.status, r.summary, r.created_at
    from public.marketing_automation_runs r
    left join public.brands b on b.id = r.brand_id
    where r.tenant_id = $1
    order by r.created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name ?? "Workspace",
    automationType: row.automation_type,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at.toISOString()
  }));
}
