import { NextRequest, NextResponse } from "next/server";
import {
  ferocityCommandCapabilities,
  understandFerocityCommand,
  type FerocityCommandCapability,
} from "@/lib/ai-workforce/command-understanding";
import { queryPostgres } from "@/lib/db/postgres";

const scenarios: Array<{ capability: FerocityCommandCapability; command: string }> = [
  { capability: "growth_revenue", command: "Find the highest-value realistic path to grow collected revenue and profit without overwhelming capacity." },
  { capability: "lead_follow_up", command: "Show me which stale leads and unsold estimates deserve follow-up first." },
  { capability: "collections", command: "Who owes us money, what is overdue, and what collection steps should be prepared?" },
  { capability: "marketing", command: "Find the strongest current marketing opportunity and prepare a channel-appropriate campaign without publishing it." },
  { capability: "seo", command: "Audit our search visibility and prioritize legitimate SEO improvements based on business value." },
  { capability: "website", command: "Review the website conversion path and tell me what should be improved first." },
  { capability: "reviews_proof", command: "Turn completed work and customer outcomes into approval-safe review and proof workflows." },
  { capability: "jobs_estimates", command: "Find estimates or active jobs with scope, material, payment, or profitability risk." },
  { capability: "schedule_dispatch", command: "Check tomorrow's schedule for conflicts, missing assignments, and customer-impacting changes." },
  { capability: "workforce_time", command: "Review employee hours, availability, labor cost, and incomplete time records." },
  { capability: "reminders", command: "Remind me tomorrow to review the largest unpaid invoice." },
  { capability: "calls_office", command: "Review our phone coverage, missed calls, callback handling, and human transfer rules." },
  { capability: "setup", command: "Set Ferocity up around this business while keeping protected actions behind approval." },
  { capability: "reporting_attention", command: "Check the whole business and show only what genuinely needs owner attention today." },
  { capability: "support_health", command: "Check whether anything important is broken, degraded, disconnected, or failing repeatedly." },
];

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || request.headers.get("x-ferocity-certification") !== "command-understanding") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const fixture = await queryPostgres<{ tenant_id: string; brand_id: string; name: string; industry: string | null; business_model: string | null }>(`
    select t.id as tenant_id,b.id as brand_id,b.name,b.industry,b.business_model
    from public.tenants t join public.brands b on b.tenant_id=t.id and b.status='active'
    where lower(t.name)='internal portfolio' and lower(b.slug)='ferocity'
    order by b.created_at asc limit 1
  `);
  const business = fixture?.rows[0];
  if (!business) return NextResponse.json({ error: "Ferocity's internal workspace was not found." }, { status: 409 });
  const startedAt = new Date();
  const results: Array<{ capability: string; matched: string[]; mode: string; answerLength: number }> = [];
  let index = 0;
  const workerCount = 3;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (index < scenarios.length) {
      const scenario = scenarios[index];
      index += 1;
      const understood = await understandFerocityCommand({
        tenantId: business.tenant_id,
        command: scenario.command,
        businessContext: `Business: ${business.name}. Industry: ${business.industry ?? "not set"}. Business model: ${business.business_model ?? "not set"}. This is a read-only command-understanding certification; do not claim any execution occurred.`,
      });
      if (!understood.capabilities.includes(scenario.capability)) {
        throw new Error(`${scenario.capability} was not recognized. Returned: ${understood.capabilities.join(", ") || "none"}.`);
      }
      if (understood.answer.length < 80) throw new Error(`${scenario.capability} returned an insufficient answer.`);
      results.push({
        capability: scenario.capability,
        matched: understood.capabilities,
        mode: understood.requestedMode,
        answerLength: understood.answer.length,
      });
    }
  }));

  const usage = await queryPostgres<{ status: string; fallback_used: boolean }>(`
    select status,fallback_used from public.ai_usage_events
    where tenant_id=$1 and run_type='ferocity_command_understanding' and created_at >= $2
    order by created_at
  `, [business.tenant_id, startedAt.toISOString()]);
  const usageRows = usage?.rows ?? [];
  if (usageRows.length !== scenarios.length) {
    return NextResponse.json({ error: `Expected ${scenarios.length} AI evidence records; found ${usageRows.length}.` }, { status: 500 });
  }
  if (usageRows.some((row) => row.status !== "completed" || row.fallback_used)) {
    return NextResponse.json({ error: "One or more command families used fallback instead of verified live AI." }, { status: 500 });
  }

  return NextResponse.json({
    tenantId: business.tenant_id,
    expectedCapabilities: ferocityCommandCapabilities.length,
    certifiedCapabilities: results.sort((a, b) => a.capability.localeCompare(b.capability)),
    liveAiEvidenceRecords: usageRows.length,
  });
}
