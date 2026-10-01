import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { queryPostgres } from "@/lib/db/postgres";
import { evaluateOrganicContentWinners } from "@/lib/marketing/ai-content-production";
import { safeLogAppError } from "@/lib/observability/log-error";
import { runClosedLoopGrowthController } from "./closed-loop-controller";
import { ensureCoreMarketingPlaybooks, runComposableGrowthIntelligence, syncSharedMarketingBrain } from "./composable-growth-intelligence";

export type OwnerInvolvement = "automatic" | "approval" | "personal";
export type GrowthDepartmentAction = {
  key: string;
  category: "audience" | "competitor" | "conversation" | "website" | "seo_geo" | "email" | "content" | "offer" | "positioning" | "retention" | "referral" | "reputation" | "follow_up" | "attribution";
  title: string;
  whyNow: string;
  nextStep: string;
  ownerInvolvement: OwnerInvolvement;
  organicFirst: boolean;
  priorityScore: number;
  confidenceScore: number;
  estimatedValueCents: number | null;
  evidence: string[];
  channels: string[];
};

type GrowthDepartmentResponse = {
  actions: GrowthDepartmentAction[];
  memory: Array<{
    type: "ideal_customer" | "customer_language" | "pain_point" | "objection" | "won_reason" | "lost_reason" | "competitor" | "competitor_change" | "positioning" | "website_gap" | "channel_learning" | "conversation_signal" | "brand_voice";
    title: string;
    summary: string;
    confidenceScore: number;
    evidence: string[];
  }>;
};

type EvidenceSnapshot = {
  brand: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  services: Record<string, unknown>[];
  locations: Record<string, unknown>[];
  recentOutcomes: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  attribution: Record<string, unknown>[];
  websiteSignals: Record<string, unknown>[];
  existingMemory: Record<string, unknown>[];
  objectives: Record<string, unknown>[];
  idealCustomers: Record<string, unknown>[];
  idealJobs: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  voiceOfCustomer: Record<string, unknown>[];
  controller: Record<string, unknown> | null;
  marketingBrain: Record<string, unknown> | null;
  playbooks: Record<string, unknown>[];
  capabilityAssessment: GrowthCapabilityAssessment;
};

export type GrowthCapabilityAssessment = {
  score: number;
  stages: Array<{ key: string; label: string; score: number; status: "ready" | "partial" | "missing"; evidence: string; nextMove: string }>;
};

export function buildGrowthCapabilityAssessment(counts: Record<string, number>): GrowthCapabilityAssessment {
  const stage = (key: string, label: string, signals: number[], evidence: string, nextMove: string) => {
    const present = signals.filter((value) => value > 0).length;
    const score = Math.round((present / signals.length) * 100);
    return { key, label, score, status: (score >= 100 ? "ready" : score > 0 ? "partial" : "missing") as "ready" | "partial" | "missing", evidence, nextMove };
  };
  const stages = [
    stage("foundation", "Business foundation", [counts.brands, counts.services, counts.locations], `${counts.brands} brands · ${counts.services} services · ${counts.locations} areas`, "Confirm the business, offers, audience, service area, proof and operating rules."),
    stage("capture", "Demand and lead capture", [counts.forms, counts.leads], `${counts.forms} forms · ${counts.leads} leads`, "Give every useful campaign and conversation a tracked way to become a lead."),
    stage("follow_up", "Lead response and nurture", [counts.leads, counts.followUps], `${counts.leads} leads · ${counts.followUps} follow-up workflows`, "Prepare and run authorized response, nurture and recovery workflows."),
    stage("proof", "Trust and proof", [counts.reviews, counts.proof], `${counts.reviews} review workflows · ${counts.proof} proof assets`, "Collect real reviews, customer proof and approved media, then reuse them safely."),
    stage("content", "Organic content engine", [counts.contentOutputs, counts.publishing], `${counts.contentOutputs} content outputs · ${counts.publishing} publishing items`, "Turn live customer and market evidence into quality-gated organic content."),
    stage("conversion", "Sales conversion", [counts.estimates, counts.jobs], `${counts.estimates} estimates · ${counts.jobs} jobs`, "Measure which leads become real opportunities, estimates and customers."),
    stage("money", "Revenue and profitability", [counts.invoices, counts.payments], `${counts.invoices} invoices · ${counts.payments} payments`, "Connect completed work to invoices, payments, costs and profit."),
    stage("learning", "Closed-loop learning", [counts.attribution, counts.memory], `${counts.attribution} attribution touches · ${counts.memory} learned signals`, "Preserve source-to-profit attribution and feed outcomes back into Growth." )
  ];
  return { score: Math.round(stages.reduce((total, item) => total + item.score, 0) / stages.length), stages };
}

const allowedCategories = new Set<GrowthDepartmentAction["category"]>([
  "audience", "competitor", "conversation", "website", "seo_geo", "email", "content", "offer", "positioning",
  "retention", "referral", "reputation", "follow_up", "attribution"
]);
const allowedInvolvement = new Set<OwnerInvolvement>(["automatic", "approval", "personal"]);

export function normalizeGrowthDepartmentActions(actions: GrowthDepartmentAction[], maxActions = 5) {
  const seen = new Set<string>();
  return actions
    .filter((action) => action && typeof action.key === "string" && typeof action.title === "string")
    .map((action) => ({
      ...action,
      key: action.key.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").slice(0, 120),
      category: allowedCategories.has(action.category) ? action.category : "content",
      ownerInvolvement: allowedInvolvement.has(action.ownerInvolvement) ? action.ownerInvolvement : "approval",
      organicFirst: action.organicFirst !== false,
      priorityScore: Math.max(0, Math.min(100, Math.round(Number(action.priorityScore) || 0))),
      confidenceScore: Math.max(0, Math.min(100, Math.round(Number(action.confidenceScore) || 0))),
      estimatedValueCents: action.estimatedValueCents == null ? null : Math.max(0, Math.round(Number(action.estimatedValueCents) || 0)),
      evidence: Array.isArray(action.evidence) ? action.evidence.filter(Boolean).slice(0, 8) : [],
      channels: Array.isArray(action.channels) ? action.channels.filter(Boolean).slice(0, 8) : []
    }))
    .filter((action) => action.key && !seen.has(action.key) && (seen.add(action.key), true))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore)
    .slice(0, Math.max(1, Math.min(maxActions, 10)));
}

function fallbackActions(snapshot: EvidenceSnapshot): GrowthDepartmentAction[] {
  const actions: GrowthDepartmentAction[] = [];
  if (!snapshot.profile) actions.push({ key: "complete-growth-profile", category: "audience", title: "Teach Ferocity who buys and why", whyNow: "The growth profile is incomplete, so targeting and voice cannot yet be evidence-led.", nextStep: "Confirm the ideal customers, strongest services, service area, proof, preferred language, and prohibited claims.", ownerInvolvement: "personal", organicFirst: true, priorityScore: 95, confidenceScore: 100, estimatedValueCents: null, evidence: ["No active Marketing OS business profile was found."], channels: [] });
  if (snapshot.opportunities.length) actions.push({ key: "respond-to-best-conversation", category: "conversation", title: "Help in the strongest active conversation", whyNow: "Ferocity found a relevant conversation with service or buying intent.", nextStep: "Review the source and contextual response, then approve only if it genuinely helps and follows community rules.", ownerInvolvement: "approval", organicFirst: true, priorityScore: 90, confidenceScore: 85, estimatedValueCents: null, evidence: [`${snapshot.opportunities.length} active conversation opportunities.`], channels: [] });
  if (snapshot.websiteSignals.length) actions.push({ key: "fix-best-website-gap", category: "website", title: "Fix the highest-value website gap", whyNow: "A current website or SEO signal indicates unclear coverage or conversion friction.", nextStep: "Improve the highest-priority page with real proof, a clear offer, useful answers, and one next step.", ownerInvolvement: "approval", organicFirst: true, priorityScore: 82, confidenceScore: 80, estimatedValueCents: null, evidence: [`${snapshot.websiteSignals.length} website or SEO opportunities.`], channels: ["website"] });
  if (!snapshot.attribution.length) actions.push({ key: "close-attribution-gap", category: "attribution", title: "Connect growth actions to money", whyNow: "Ferocity cannot yet compare sources by revenue and profit.", nextStep: "Preserve source and campaign references through lead, estimate, job, invoice, and Ferocity Earn attribution.", ownerInvolvement: "automatic", organicFirst: true, priorityScore: 78, confidenceScore: 100, estimatedValueCents: null, evidence: ["No recent attribution outcomes were found."], channels: [] });
  for (const capability of snapshot.capabilityAssessment.stages.filter((item) => item.status !== "ready")) {
    actions.push({ key: `capability:${capability.key}`, category: capability.key === "proof" ? "reputation" : capability.key === "content" ? "content" : capability.key === "follow_up" ? "follow_up" : capability.key === "learning" ? "attribution" : "positioning", title: `Strengthen ${capability.label.toLowerCase()}`, whyNow: `${capability.evidence}. This is currently ${capability.status}.`, nextStep: capability.nextMove, ownerInvolvement: capability.key === "foundation" ? "personal" : "approval", organicFirst: true, priorityScore: capability.status === "missing" ? 88 : 70, confidenceScore: 100, estimatedValueCents: null, evidence: [capability.evidence], channels: [] });
  }
  return actions;
}

async function loadEvidence(tenantId: string, brandId: string): Promise<EvidenceSnapshot> {
  const [brand, profile, services, locations, outcomes, conversations, opportunities, attribution, website, memory, objectives, idealCustomers, idealJobs, offers, voiceOfCustomer, controller, marketingBrain, playbooks, capabilities] = await Promise.all([
    queryPostgres(`select id, name, industry, primary_location, status from public.brands where tenant_id = $1 and id = $2 limit 1`, [tenantId, brandId]),
    queryPostgres(`select company_name, website_url, brand_voice, ideal_customers, services_json, service_areas_json, offers_json, reviews_json, audience_json, positioning_json, proof_json, marketing_rules_json from public.marketing_os_business_profiles where tenant_id = $1 and brand_id = $2 and status <> 'archived' limit 1`, [tenantId, brandId]),
    queryPostgres(`select name, description, priority from public.brand_services where tenant_id = $1 and brand_id = $2 and active = true order by priority desc limit 30`, [tenantId, brandId]),
    queryPostgres(`select city, state, service_area_name, priority from public.brand_locations where tenant_id = $1 and brand_id = $2 and active = true order by priority desc limit 30`, [tenantId, brandId]),
    queryPostgres(`select status, source, source_detail, count(*)::int as total from public.leads where tenant_id = $1 and brand_id = $2 and created_at >= now() - interval '90 days' group by status, source, source_detail order by total desc limit 40`, [tenantId, brandId]),
    queryPostgres(`select channel, status, subject, last_message_at from public.messaging_conversations where tenant_id = $1 and brand_id = $2 order by last_message_at desc nulls last limit 30`, [tenantId, brandId]),
    queryPostgres(`select channel_key, detected_intent, service_focus, geography_text, overall_score, body_excerpt, source_url, status from public.growth_opportunities where tenant_id = $1 and brand_id = $2 and status in ('detected','scored','reviewed','queued') order by overall_score desc, detected_at desc limit 30`, [tenantId, brandId]),
    queryPostgres(`select channel_key, source_name, touch_role, pipeline_value_cents, won_revenue_cents, occurred_at from public.growth_attribution_touches where tenant_id = $1 and brand_id = $2 and occurred_at >= now() - interval '180 days' order by won_revenue_cents desc, occurred_at desc limit 50`, [tenantId, brandId]),
    queryPostgres(`select opportunity_type, page_type, title, priority_score, reason, next_step, status from public.seo_page_opportunities where tenant_id = $1 and brand_id = $2 and status in ('open','planned','draft_created','in_review') order by priority_score desc limit 30`, [tenantId, brandId]),
    queryPostgres(`select memory_type, title, summary, score, status, confidence_score, evidence_json from public.marketing_memory_items where tenant_id = $1 and brand_id = $2 and status <> 'archived' order by score desc, last_observed_at desc limit 60`, [tenantId, brandId]),
    queryPostgres(`select id,name,service_focus,geography_json,target_revenue_cents,target_collected_revenue_cents,target_gross_profit_cents,average_job_value_cents,cost_per_lead_cents,gross_margin_target_bps,minimum_gross_margin_bps,maximum_cac_cents,minimum_roas_milli,monthly_job_capacity,maximum_backlog_jobs,time_horizon_days,autonomy_level,status from public.growth_objectives where tenant_id=$1 and brand_id=$2 and status in ('active','draft') order by case status when 'active' then 1 else 2 end,updated_at desc limit 10`, [tenantId, brandId]),
    queryPostgres(`select name,customer_type,firmographics_json,demographics_json,geography_json,pains_json,desired_outcomes_json,buying_triggers_json,objections_json,disqualifiers_json,evidence_json,confidence_score,sample_size,last_validated_at,status from public.growth_icp_profiles where tenant_id=$1 and brand_id=$2 and status <> 'archived' order by case status when 'active' then 1 else 2 end,confidence_score desc limit 10`, [tenantId, brandId]),
    queryPostgres(`select name,service_keys,minimum_value_cents,maximum_value_cents,minimum_margin_bps,geography_json,capacity_requirements_json,qualification_rules_json,disqualifiers_json,evidence_json,confidence_score,status from public.growth_ideal_job_profiles where tenant_id=$1 and brand_id=$2 and status <> 'archived' order by case status when 'active' then 1 else 2 end,confidence_score desc limit 10`, [tenantId, brandId]),
    queryPostgres(`select offer_key,version,name,promise,mechanism,included_json,exclusions_json,proof_requirements_json,price_floor_cents,price_ceiling_cents,minimum_margin_bps,capacity_cost_json,status,valid_from,valid_until from public.growth_offers where tenant_id=$1 and brand_id=$2 and status not in ('archived','retired') order by case status when 'active' then 1 when 'testing' then 2 else 3 end,updated_at desc limit 20`, [tenantId, brandId]),
    queryPostgres(`select source_type,signal_type,verbatim_excerpt,normalized_summary,tags,confidence_score,evidence_json,observed_at,review_status from public.growth_voc_signals where tenant_id=$1 and brand_id=$2 and review_status in ('learning','verified') and (expires_at is null or expires_at > now()) order by confidence_score desc,observed_at desc limit 60`, [tenantId, brandId]),
    queryPostgres(`select directive,target_gap_cents,data_health_score,capacity_json,economics_json,reverse_plan_json,reasons_json,evidence_json,generated_at from public.growth_controller_snapshots where tenant_id=$1 and brand_id=$2 order by generated_at desc limit 1`, [tenantId, brandId]),
    queryPostgres(`select version,truth_json,source_freshness_json,missing_context_json,confidence_score,generated_at from public.marketing_brain_snapshots where tenant_id=$1 and brand_id=$2 order by version desc limit 1`, [tenantId, brandId]),
    queryPostgres(`select playbook.playbook_key,playbook.name,playbook.purpose,playbook.category,version.version,version.required_context_json,version.workflow_json,version.decision_rules_json,version.outputs_json,version.quality_checks_json,version.success_metrics_json,version.permissions_json
      from public.marketing_playbooks playbook join public.marketing_playbook_versions version on version.playbook_id=playbook.id and version.tenant_id=playbook.tenant_id
      where playbook.tenant_id=$1 and playbook.status='active' and version.status='active' and version.version=playbook.current_version order by playbook.playbook_key`, [tenantId]),
    queryPostgres<Record<string, string>>(`select (select count(*) from public.brands where tenant_id=$1 and id=$2 and status='active')::text as brands, (select count(*) from public.brand_services where tenant_id=$1 and brand_id=$2 and active=true)::text as services, (select count(*) from public.brand_locations where tenant_id=$1 and brand_id=$2 and active=true)::text as locations, (select count(*) from public.forms where tenant_id=$1 and brand_id=$2)::text as forms, (select count(*) from public.leads where tenant_id=$1 and brand_id=$2)::text as leads, (select count(*) from public.follow_up_workflows where tenant_id=$1 and brand_id=$2)::text as follow_ups, (select count(*) from public.review_request_workflows where tenant_id=$1 and brand_id=$2)::text as reviews, ((select count(*) from public.ugc_assets where tenant_id=$1 and brand_id=$2)+(select count(*) from public.marketing_media_assets where tenant_id=$1 and brand_id=$2 and approved_for_ai_reuse=true))::text as proof, (select count(*) from public.content_studio_outputs where tenant_id=$1 and brand_id=$2)::text as content_outputs, (select count(*) from public.publishing_queue where tenant_id=$1 and brand_id=$2)::text as publishing, (select count(*) from public.service_estimates where tenant_id=$1 and brand_id=$2)::text as estimates, (select count(*) from public.service_jobs where tenant_id=$1 and brand_id=$2)::text as jobs, (select count(*) from public.service_invoices where tenant_id=$1 and brand_id=$2)::text as invoices, (select count(*) from public.service_invoice_payments where tenant_id=$1 and brand_id=$2 and status in ('succeeded','manual'))::text as payments, (select count(*) from public.growth_attribution_touches where tenant_id=$1 and brand_id=$2)::text as attribution, (select count(*) from public.marketing_memory_items where tenant_id=$1 and brand_id=$2 and status <> 'archived')::text as memory`, [tenantId, brandId])
  ]);
  const raw = capabilities?.rows[0] ?? {};
  const capabilityAssessment = buildGrowthCapabilityAssessment({ brands: Number(raw.brands ?? 0), services: Number(raw.services ?? 0), locations: Number(raw.locations ?? 0), forms: Number(raw.forms ?? 0), leads: Number(raw.leads ?? 0), followUps: Number(raw.follow_ups ?? 0), reviews: Number(raw.reviews ?? 0), proof: Number(raw.proof ?? 0), contentOutputs: Number(raw.content_outputs ?? 0), publishing: Number(raw.publishing ?? 0), estimates: Number(raw.estimates ?? 0), jobs: Number(raw.jobs ?? 0), invoices: Number(raw.invoices ?? 0), payments: Number(raw.payments ?? 0), attribution: Number(raw.attribution ?? 0), memory: Number(raw.memory ?? 0) });
  return { brand: brand?.rows[0] ?? null, profile: profile?.rows[0] ?? null, services: services?.rows ?? [], locations: locations?.rows ?? [], recentOutcomes: outcomes?.rows ?? [], conversations: conversations?.rows ?? [], opportunities: opportunities?.rows ?? [], attribution: attribution?.rows ?? [], websiteSignals: website?.rows ?? [], existingMemory: memory?.rows ?? [], objectives: objectives?.rows ?? [], idealCustomers: idealCustomers?.rows ?? [], idealJobs: idealJobs?.rows ?? [], offers: offers?.rows ?? [], voiceOfCustomer: voiceOfCustomer?.rows ?? [], controller: controller?.rows[0] ?? null, marketingBrain: marketingBrain?.rows[0] ?? null, playbooks: playbooks?.rows ?? [], capabilityAssessment };
}

export async function runAiGrowthDepartment(input: { tenantId: string; brandId?: string | null; userId?: string | null; maxActions?: number; intelligencePrepared?: boolean }) {
  const brands = input.brandId ? [{ id: input.brandId }] : (await queryPostgres<{ id: string }>(`select id from public.brands where tenant_id = $1 and status = 'active' order by created_at limit 20`, [input.tenantId]))?.rows ?? [];
  const allActions: GrowthDepartmentAction[] = [];
  if (!input.intelligencePrepared) await ensureCoreMarketingPlaybooks(input.tenantId);

  for (const brand of brands) {
    if (!input.intelligencePrepared) await syncSharedMarketingBrain(input.tenantId, brand.id);
    const snapshot = await loadEvidence(input.tenantId, brand.id);
    const fallback: GrowthDepartmentResponse = { actions: fallbackActions(snapshot), memory: [] };
    const response = await generateJsonWithAiService<GrowthDepartmentResponse>({
      tenantId: input.tenantId, brandId: brand.id, userId: input.userId ?? null,
      featureKey: "ai_marketing_department", runType: "ai_growth_department",
      system: "You are Ferocity's evidence-led AI Growth Department. Return JSON only. Compose the supplied versioned playbooks; do not invent a giant one-off workflow. Work from the supplied Marketing Brain as shared truth and flag missing context instead of guessing. Use only supplied evidence. Never invent competitors, claims, customer language, market facts, or platform access. Respect the latest closed-loop controller directive: repair data before guessing, constrain demand when margin or capacity is unsafe, and expand only when evidence and capacity support it. Prefer useful organic work before paid advertising. Optimize for qualified leads, completed work, collected revenue and profit—not impressions or content volume. Paid spend is never an automatic action. Keep the owner to at most five valuable actions. ownerInvolvement must be automatic only for safe internal analysis or already-authorized work, approval for external/publishing/outreach work, and personal for a true business decision or missing owner knowledge.",
      user: `Analyze this evidence snapshot and return {\"actions\":[],\"memory\":[]}. Each action needs key, category, title, whyNow, nextStep, ownerInvolvement, organicFirst, priorityScore, confidenceScore, estimatedValueCents, evidence, channels. Each memory item needs type, title, summary, confidenceScore, evidence. Evidence:\n${JSON.stringify(snapshot)}`,
      fallback, temperature: 0.2, metadata: { strategy: "organic_first", evidenceOnly: true }
    });
    const actions = normalizeGrowthDepartmentActions(response.actions ?? fallback.actions, input.maxActions ?? 5);
    allActions.push(...actions);

    for (const action of actions) {
      await queryPostgres(`insert into public.marketing_campaign_recommendations (tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal, recommended_channels, recommended_outputs_json, expected_impact, difficulty, priority_score, status, source_signals_json, metadata_json, opportunity_category, recommended_action_key, owner_involvement, organic_first, estimated_value_cents, confidence_score, evidence_json, handled_at, expires_at, updated_at, capability_keys, execution_status, assessment_json) values ($1,$2,$3,$4,$5,'grow_profitable_revenue',$6::text[],$7::jsonb,$8,'medium',$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,now() + interval '14 days',now(),$21::text[],$22,$23::jsonb) on conflict (tenant_id, brand_id, recommendation_key) do update set title=excluded.title, trigger_reason=excluded.trigger_reason, recommended_channels=excluded.recommended_channels, recommended_outputs_json=excluded.recommended_outputs_json, priority_score=excluded.priority_score, status=excluded.status, source_signals_json=excluded.source_signals_json, metadata_json=excluded.metadata_json, opportunity_category=excluded.opportunity_category, recommended_action_key=excluded.recommended_action_key, owner_involvement=excluded.owner_involvement, organic_first=excluded.organic_first, estimated_value_cents=excluded.estimated_value_cents, confidence_score=excluded.confidence_score, evidence_json=excluded.evidence_json, handled_at=excluded.handled_at, expires_at=excluded.expires_at, capability_keys=excluded.capability_keys, execution_status=case when public.marketing_campaign_recommendations.execution_status in ('completed','measuring') then public.marketing_campaign_recommendations.execution_status else excluded.execution_status end, assessment_json=excluded.assessment_json, updated_at=now()`, [input.tenantId, brand.id, `growth-department:${action.key}`, action.title, action.whyNow, action.channels, JSON.stringify([{ nextStep: action.nextStep }]), action.nextStep, action.priorityScore, action.ownerInvolvement === "approval" ? "needs_review" : "recommended", JSON.stringify({ evidence: action.evidence }), JSON.stringify({ generatedBy: "ai_growth_department", organicFirst: action.organicFirst }), action.category, action.key, action.ownerInvolvement, action.organicFirst, action.estimatedValueCents, action.confidenceScore, JSON.stringify(action.evidence), action.ownerInvolvement === "automatic" ? new Date().toISOString() : null, [action.key.startsWith("capability:") ? action.key.replace("capability:", "") : action.category], action.ownerInvolvement === "approval" ? "waiting_approval" : "suggested", JSON.stringify(snapshot.capabilityAssessment)]);
    }
    for (const item of (response.memory ?? []).slice(0, 20)) {
      if (!item?.title || !item?.type || !Array.isArray(item.evidence) || item.evidence.length === 0) continue;
      await queryPostgres(`with updated as (update public.marketing_memory_items set summary=$5, score=$6, confidence_score=$6, evidence_json=$8::jsonb, last_observed_at=now(), metadata_json=metadata_json || $7::jsonb, updated_at=now() where tenant_id=$1 and brand_id=$2 and memory_type=$3 and lower(title)=lower($4) and status <> 'archived' returning id) insert into public.marketing_memory_items (tenant_id, brand_id, memory_type, title, summary, score, status, metadata_json, confidence_score, evidence_json, first_observed_at, last_observed_at) select $1,$2,$3,$4,$5,$6,'learning',$7::jsonb,$6,$8::jsonb,now(),now() where not exists (select 1 from updated)`, [input.tenantId, brand.id, item.type, item.title.slice(0, 240), item.summary?.slice(0, 4000) ?? null, Math.max(0, Math.min(100, Number(item.confidenceScore) || 50)), JSON.stringify({ generatedBy: "ai_growth_department" }), JSON.stringify(item.evidence.slice(0, 8))]);
    }
  }

  const unique = normalizeGrowthDepartmentActions(allActions, Math.max(5, input.maxActions ?? 5));
  return { worthwhile: unique.length, handledAutomatically: unique.filter((a) => a.ownerInvolvement === "automatic").length, needsApproval: unique.filter((a) => a.ownerInvolvement === "approval").length, needsOwner: unique.filter((a) => a.ownerInvolvement === "personal").length, actions: unique };
}

export async function runAiGrowthDepartmentSweep(options: { tenantLimit?: number; tenantId?: string | null } = {}) {
  const tenantLimit = Math.max(1, Math.min(options.tenantLimit ?? 50, 200));
  const tenants = await queryPostgres<{ tenant_id: string }>(
    `
    select entitlement.tenant_id
    from public.workspace_feature_entitlements entitlement
    join public.tenants tenant on tenant.id = entitlement.tenant_id and tenant.status <> 'archived'
    where entitlement.feature_key = 'ai_marketing_department'
      and entitlement.status <> 'disabled'
      and ($2::uuid is null or entitlement.tenant_id = $2::uuid)
      and not exists (
        select 1 from public.operator_timeline_events event
        where event.tenant_id = entitlement.tenant_id
          and event.event_type = 'ai_growth_department_daily'
          and event.occurred_at >= date_trunc('day', now())
      )
    order by entitlement.updated_at asc
    limit $1
    `,
    [tenantLimit, options.tenantId ?? null]
  );
  let processed = 0;
  let actions = 0;
  let failed = 0;
  for (const tenant of tenants?.rows ?? []) {
    try {
      const intelligence = await runComposableGrowthIntelligence(tenant.tenant_id);
      const controller = await runClosedLoopGrowthController({ tenantId: tenant.tenant_id });
      const result = await runAiGrowthDepartment({ tenantId: tenant.tenant_id, maxActions: 5, intelligencePrepared: true });
      const contentLearning = await evaluateOrganicContentWinners({ tenantId: tenant.tenant_id });
      await queryPostgres(
        `insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json) values ($1,'marketing','ai_growth_department_daily',$2,$3,$4::jsonb)`,
        [tenant.tenant_id, `Ferocity found ${result.worthwhile} worthwhile growth actions`, `${result.handledAutomatically} handled safely, ${result.needsApproval} need approval, and ${result.needsOwner} need the owner personally.`, JSON.stringify({ generatedBy: "ai_growth_department", intelligence, controller, ...result, contentLearning, actions: result.actions.map(({ key, title }) => ({ key, title })) })]
      );
      processed += 1;
      actions += result.worthwhile;
    } catch (error) {
      failed += 1;
      await safeLogAppError({
        tenantId: tenant.tenant_id,
        source: "growth.ai_department.daily_sweep",
        message: error instanceof Error ? error.message : "AI Growth Department daily sweep failed.",
        severity: "error",
        retryable: true,
        metadata: { isolatedToTenant: true }
      });
    }
  }
  return { processed, actions, failed };
}
