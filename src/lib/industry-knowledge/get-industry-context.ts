import { queryPostgres } from "@/lib/db/postgres";

export type IndustryKnowledgeContext = {
  moduleKey: string;
  industryKey: string;
  moduleName: string;
  guardrails: string[];
  items: Array<{
    category: string;
    title: string;
    content: string;
    riskLevel: string;
    requiresVerification: boolean;
  }>;
};

const roofingFallback: IndustryKnowledgeContext = {
  moduleKey: "roofing_core",
  industryKey: "roofing",
  moduleName: "Roofing business operations",
  guardrails: [
    "Do not diagnose damage or promise insurance coverage, code compliance, licensing, warranties, pricing, or product suitability without verified evidence.",
    "Active leaks, structural concerns, injuries, electrical hazards, and unsafe access require human escalation.",
    "Collect useful context, but leave final scope, safety, code, and price decisions to qualified people."
  ],
  items: [
    {
      category: "intake",
      title: "Roofing intake essentials",
      content: "Collect location, roof type and age if known, symptoms, timing, urgency, safe-access limits, and contact preference.",
      riskLevel: "low",
      requiresVerification: false
    },
    {
      category: "qualification",
      title: "Roofing urgency",
      content: "Active leaks, water intrusion, exposed decking, storm damage, missing material, or unsafe conditions deserve faster human review.",
      riskLevel: "high",
      requiresVerification: true
    },
    {
      category: "follow_up",
      title: "Estimate follow-up",
      content: "Answer scope questions, explain options without pressure, confirm timing, and offer a clear inspection or decision call.",
      riskLevel: "low",
      requiresVerification: false
    }
  ]
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function getIndustryKnowledgeContext(input: {
  tenantId: string;
  brandId?: string | null;
  categories?: string[];
}): Promise<IndustryKnowledgeContext | null> {
  const result = await queryPostgres<{
    module_key: string;
    industry_key: string;
    module_name: string;
    guardrails_json: unknown;
    category: string;
    title: string;
    content: string;
    risk_level: string;
    requires_verification: boolean;
  }>(
    `
    with selected_module as (
      select m.id, m.module_key, m.industry_key, m.name, m.guardrails_json
      from public.industry_knowledge_modules m
      left join public.tenant_industry_modules tm
        on tm.module_id = m.id
        and tm.tenant_id = $1
        and tm.status = 'active'
        and (tm.brand_id is null or tm.brand_id = nullif($2::text, '')::uuid)
      left join public.brands b
        on b.tenant_id = $1
        and b.id = nullif($2::text, '')::uuid
      where m.status = 'active'
        and (
          tm.id is not null
          or lower(coalesce(b.industry, '')) like '%' || m.industry_key || '%'
          or lower(coalesce(b.vertical, '')) = m.industry_key
        )
      order by (tm.id is not null) desc, m.version desc
      limit 1
    )
    select m.module_key, m.industry_key, m.name as module_name, m.guardrails_json,
      i.category, i.title, i.content, i.risk_level, i.requires_verification
    from selected_module m
    join public.industry_knowledge_items i on i.module_id = m.id
    where cardinality($3::text[]) = 0 or i.category = any($3::text[])
    order by i.category, i.created_at
    limit 30
    `,
    [input.tenantId, input.brandId ?? "", input.categories ?? []]
  );
  const rows = result?.rows ?? [];
  if (rows.length) {
    return {
      moduleKey: rows[0].module_key,
      industryKey: rows[0].industry_key,
      moduleName: rows[0].module_name,
      guardrails: stringArray(rows[0].guardrails_json),
      items: rows.map((row) => ({
        category: row.category,
        title: row.title,
        content: row.content,
        riskLevel: row.risk_level,
        requiresVerification: row.requires_verification
      }))
    };
  }

  const brand = await queryPostgres<{ industry: string | null; vertical: string | null }>(
    `select industry, vertical from public.brands where tenant_id = $1 and id = nullif($2::text, '')::uuid limit 1`,
    [input.tenantId, input.brandId ?? ""]
  );
  const label = `${brand?.rows[0]?.industry ?? ""} ${brand?.rows[0]?.vertical ?? ""}`.toLowerCase();
  if (!label.includes("roof")) return null;
  const categories = new Set(input.categories ?? []);
  return categories.size
    ? { ...roofingFallback, items: roofingFallback.items.filter((item) => categories.has(item.category)) }
    : roofingFallback;
}

export function industryContextForPrompt(context: IndustryKnowledgeContext | null) {
  if (!context) return "No industry module is active. Ask only general intake questions and avoid industry-specific claims.";
  return [
    `Active module: ${context.moduleName} (${context.moduleKey}).`,
    ...context.guardrails.map((item) => `Guardrail: ${item}`),
    ...context.items.map((item) => `${item.category}: ${item.title} — ${item.content}${item.requiresVerification ? " Verify before acting." : ""}`)
  ].join("\n");
}
