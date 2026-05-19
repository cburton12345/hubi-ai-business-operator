import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type BusinessWorkflowRow = {
  id: string;
  brandId: string;
  brandName: string;
  businessModel: string;
  workflow: Record<string, unknown>;
  active: boolean;
};

const defaults: Record<string, Record<string, unknown>> = {
  local_service: {
    intake: ["quote_request", "appointment_request", "service_area"],
    followUp: "Call or email manually after qualification",
    content: ["city_service_pages", "GBP post drafts", "review request drafts"]
  },
  rental: {
    intake: ["rental_dates", "delivery_needed", "item_type"],
    followUp: "Confirm availability and quote manually",
    content: ["local rental SEO", "seasonal availability posts"]
  },
  software: {
    intake: ["demo_request", "company", "role", "current_system"],
    followUp: "Manual demo scheduling and nurture drafts",
    content: ["comparison pages", "demo nurture content"]
  },
  marketplace: {
    intake: ["buyer", "seller", "bidder", "consignor", "asset_category"],
    followUp: "Manual buyer/seller routing",
    content: ["auction content", "buyer/seller campaigns"]
  },
  lead_generation: {
    intake: ["qualification", "consent", "risk review"],
    followUp: "Manual approval before routing",
    content: ["educational content only", "no outcome guarantees"]
  }
};

export async function ensureBusinessWorkflowConfigs() {
  const workspaceId = await getCurrentWorkspaceId();
  const brands = await queryPostgres<{ id: string; business_model: string }>(
    "select id, business_model from public.brands where tenant_id = $1 and status <> 'archived'",
    [workspaceId]
  );

  for (const brand of brands?.rows ?? []) {
    await queryPostgres(
      `
      insert into public.business_workflow_configs (tenant_id, brand_id, business_model, workflow_json, active)
      values ($1, $2, $3, $4::jsonb, true)
      on conflict (brand_id, business_model) do nothing
      `,
      [workspaceId, brand.id, brand.business_model, JSON.stringify(defaults[brand.business_model] ?? {})]
    );
  }
}

export async function getBusinessWorkflowRows(): Promise<BusinessWorkflowRow[]> {
  await ensureBusinessWorkflowConfigs();
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_id: string;
    brand_name: string;
    business_model: string;
    workflow_json: Record<string, unknown>;
    active: boolean;
  }>(
    `
    select c.id, c.brand_id, b.name as brand_name, c.business_model, c.workflow_json, c.active
    from public.business_workflow_configs c
    join public.brands b on b.id = c.brand_id
    where c.tenant_id = $1
    order by b.name
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    businessModel: row.business_model,
    workflow: row.workflow_json ?? {},
    active: row.active
  }));
}
