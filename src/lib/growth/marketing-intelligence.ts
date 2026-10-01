export type MarketingAutonomy = "suggest" | "approve" | "autopilot";

export type MarketingOpportunityScoreInput = {
  impact: number;
  relevance: number;
  effort: number;
  confidence: number;
  urgency: number;
};

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function scoreMarketingOpportunity(input: MarketingOpportunityScoreInput) {
  const impact = bounded(input.impact);
  const relevance = bounded(input.relevance);
  const effort = bounded(input.effort);
  const confidence = bounded(input.confidence);
  const urgency = bounded(input.urgency);
  const score = Math.round(
    impact * 0.3 + relevance * 0.25 + confidence * 0.2 + urgency * 0.15 + (100 - effort) * 0.1
  );
  return { score, impact, relevance, effort, confidence, urgency };
}

export function marketingActionAuthority(input: {
  autonomy: MarketingAutonomy;
  external: boolean;
  paid: boolean;
  reputationImpacting: boolean;
  destructive?: boolean;
  confidence: number;
  ownerApprovedPattern?: boolean;
}) {
  const reasons: string[] = [];
  if (input.paid) reasons.push("Paid spend always requires explicit authority.");
  if (input.destructive) reasons.push("Destructive or irreversible work requires approval.");
  if (input.reputationImpacting) reasons.push("Reputation-impacting work requires review unless a narrow owner-approved policy applies.");
  if (bounded(input.confidence) < 75) reasons.push("Confidence is below the automatic-action threshold.");
  if (input.external && !input.ownerApprovedPattern) reasons.push("The external action is not covered by an owner-approved pattern.");
  if (input.autonomy !== "autopilot") reasons.push(input.autonomy === "approve" ? "Workspace policy requires approval." : "Workspace is in suggest-only mode.");
  return { mayExecute: reasons.length === 0, requiresApproval: reasons.length > 0, reasons };
}

export type OwnerGrowthGoal = {
  goalKey: "fill_capacity" | "grow_service" | "grow_geography" | "improve_visibility" | "increase_profitable_jobs" | "general_growth";
  serviceFocus: string | null;
  geography: string | null;
  timeHorizonDays: number;
  constraints: string[];
  playbooks: string[];
};

export function translateOwnerGrowthGoal(command: string): OwnerGrowthGoal {
  const text = command.trim();
  const lower = text.toLowerCase();
  const quoted = [...text.matchAll(/["“]([^"”]+)["”]/g)].map((match) => match[1]);
  const around = lower.match(/(?:around|near|in)\s+([a-z][a-z .'-]{1,60})/i)?.[1]?.trim() ?? null;
  const serviceMatch = lower.match(/more\s+([a-z][a-z -]{2,50}?)(?:\s+(?:work|jobs|customers|leads)|\s+(?:around|near|in)|$)/i)?.[1]?.trim() ?? null;
  if (/fill\s+(?:my\s+|our\s+)?(?:next\s+week|schedule|calendar|openings|capacity)/i.test(lower)) {
    return { goalKey: "fill_capacity", serviceFocus: serviceMatch, geography: around, timeHorizonDays: 7, constraints: ["respect_capacity", "prefer_qualified_work"], playbooks: ["closed_loop_growth", "evidence_to_distribution"] };
  }
  if (/without\s+(?:raising|increasing).*ad spend|profitable jobs|more profit/i.test(lower)) {
    return { goalKey: "increase_profitable_jobs", serviceFocus: serviceMatch, geography: around, timeHorizonDays: 30, constraints: ["no_increased_ad_spend", "protect_margin"], playbooks: ["closed_loop_growth", "continuous_seo", "evidence_to_distribution"] };
  }
  if (/google visibility|search visibility|seo|show up.*google|ai search/i.test(lower)) {
    return { goalKey: "improve_visibility", serviceFocus: serviceMatch, geography: around, timeHorizonDays: 60, constraints: ["no_ranking_promises", "evidence_only"], playbooks: ["continuous_seo", "ai_search_visibility", "local_presence"] };
  }
  if (around) {
    return { goalKey: "grow_geography", serviceFocus: serviceMatch ?? quoted[0] ?? null, geography: around, timeHorizonDays: 30, constraints: ["verify_service_area", "protect_margin"], playbooks: ["closed_loop_growth", "continuous_seo", "local_presence"] };
  }
  if (serviceMatch) {
    return { goalKey: "grow_service", serviceFocus: serviceMatch, geography: null, timeHorizonDays: 30, constraints: ["verify_offer", "protect_margin"], playbooks: ["closed_loop_growth", "evidence_to_distribution"] };
  }
  return { goalKey: "general_growth", serviceFocus: quoted[0] ?? null, geography: null, timeHorizonDays: 30, constraints: ["use_business_value", "respect_capacity"], playbooks: ["closed_loop_growth"] };
}

export function answerEngineFindings(input: {
  businessMentioned: boolean | null;
  description?: string | null;
  citations?: Array<{ url?: string; title?: string }>;
  inaccuracies?: string[];
  competitors?: string[];
}) {
  const actions: Array<{ key: string; priority: number; reason: string; action: string }> = [];
  if (input.businessMentioned === false) actions.push({ key: "source-gap", priority: 85, reason: "The business was absent from the observed answer.", action: "Strengthen the most useful first-party page and legitimate third-party sources for this question." });
  if ((input.inaccuracies ?? []).length) actions.push({ key: "factual-correction", priority: 95, reason: "The answer contained factual inaccuracies.", action: "Correct the canonical business fact, page copy, schema, and relevant provider profiles before creating more content." });
  if (!(input.citations ?? []).length) actions.push({ key: "citation-gap", priority: 70, reason: "No inspectable citations were returned.", action: "Improve direct answers and authoritative source coverage; do not claim visibility based on an uncited answer." });
  if ((input.competitors ?? []).length) actions.push({ key: "competitor-source-review", priority: 65, reason: "Competitors appeared in the answer.", action: "Review the cited competitor sources and create a genuinely stronger answer or proof asset where the business has evidence." });
  return actions.sort((a, b) => b.priority - a.priority);
}

export type MarketingPlaybookDefinition = {
  key: string;
  name: string;
  purpose: string;
  category: string;
  requiredContext: string[];
  workflow: string[];
  decisionRules: string[];
  outputs: string[];
  qualityChecks: string[];
  successMetrics: string[];
  permissions: { internalAnalysis: string; externalActions: string; paidSpend: string; reputationActions: string };
};

export const coreMarketingPlaybooks: MarketingPlaybookDefinition[] = [
  {
    key: "closed_loop_growth", name: "Closed-loop profitable growth", purpose: "Translate an owner outcome into measurable demand, sales, delivery, cash, profit, reviews and learning.", category: "orchestration",
    requiredContext: ["owner_goal", "services", "icp", "offers", "capacity", "economics", "attribution"],
    workflow: ["validate_goal", "calculate_gap", "find_bottleneck", "rank_opportunities", "compose_playbooks", "execute_authorized_work", "measure_business_value", "learn"],
    decisionRules: ["profit_and_capacity_before_volume", "repair_missing_data_before_guessing", "organic_first_when_economically_sensible"],
    outputs: ["growth_objective", "prioritized_plan", "approved_actions", "owner_brief"],
    qualityChecks: ["evidence_cited", "capacity_safe", "margin_safe", "provider_capability_truthful"],
    successMetrics: ["qualified_leads", "booked_jobs", "collected_revenue", "gross_profit", "repeat_and_referral"],
    permissions: { internalAnalysis: "automatic", externalActions: "policy", paidSpend: "explicit_approval", reputationActions: "approval_or_narrow_opt_in" }
  },
  {
    key: "continuous_seo", name: "Continuous SEO loop", purpose: "Audit, prioritize, safely fix, measure and learn from legitimate search improvements.", category: "seo",
    requiredContext: ["website", "search_console", "services", "geography", "content", "proof", "local_presence"],
    workflow: ["audit", "prioritize", "prepare_or_apply_safe_fix", "measure", "learn"],
    decisionRules: ["business_value_over_content_volume", "no_thin_pages", "no_keyword_stuffing", "safe_connected_fixes_only"],
    outputs: ["seo_cycle", "page_or_technical_actions", "distribution_drafts", "measured_learning"],
    qualityChecks: ["indexability", "factual_accuracy", "usefulness", "internal_links", "schema_matches_visible_content", "conversion_path"],
    successMetrics: ["qualified_organic_leads", "booked_jobs", "collected_revenue", "gross_profit", "useful_query_coverage"],
    permissions: { internalAnalysis: "automatic", externalActions: "policy", paidSpend: "not_applicable", reputationActions: "not_applicable" }
  },
  {
    key: "ai_search_visibility", name: "AI answer visibility", purpose: "Observe how supported answer engines describe and source the business, then close factual and authority gaps.", category: "geo",
    requiredContext: ["representative_questions", "business_truth", "competitors", "first_party_content", "authority_sources"],
    workflow: ["maintain_question_set", "observe_supported_engines", "compare_over_time", "find_source_and_fact_gaps", "prepare_actions", "measure"],
    decisionRules: ["no_visibility_claim_without_observation", "llms_txt_is_optional_not_magic", "authoritative_content_over_machine_targeting"],
    outputs: ["observation_history", "factual_corrections", "answer_content", "schema_and_authority_actions"],
    qualityChecks: ["citations_preserved", "provider_named", "raw_response_hashed", "claims_grounded"],
    successMetrics: ["accurate_mentions", "relevant_citations", "qualified_ai_referrals", "revenue_and_profit"],
    permissions: { internalAnalysis: "automatic", externalActions: "policy", paidSpend: "not_applicable", reputationActions: "approval" }
  },
  {
    key: "local_presence", name: "Local presence stewardship", purpose: "Keep local business facts accurate, reputation healthy, and discovery activity connected to real business outcomes.", category: "local_presence",
    requiredContext: ["business_truth", "locations", "services", "provider_connections", "reviews", "completed_work", "attribution"],
    workflow: ["audit_profile_truth", "prioritize_inconsistencies", "prepare_or_apply_safe_updates", "request_and_manage_reviews", "repurpose_real_business_events", "measure_calls_leads_and_revenue", "learn"],
    decisionRules: ["accuracy_before_activity", "no_fake_or_incentivized_reviews", "no_keyword_stuffing", "provider_policy_is_authoritative"],
    outputs: ["profile_health_actions", "review_workflows", "local_content", "provider_updates", "revenue_attribution"],
    qualityChecks: ["facts_match_business_truth", "customer_permission_respected", "responses_are_natural", "provider_capability_verified"],
    successMetrics: ["qualified_local_leads", "booked_jobs", "collected_revenue", "gross_profit", "review_quality_and_response_rate"],
    permissions: { internalAnalysis: "automatic", externalActions: "policy", paidSpend: "explicit_approval", reputationActions: "approval_or_narrow_opt_in" }
  },
  {
    key: "evidence_to_distribution", name: "Evidence-to-distribution loop", purpose: "Turn one real business event into channel-appropriate proof and measurable demand.", category: "content_distribution",
    requiredContext: ["business_event", "customer_permission", "proof", "brand_voice", "channel_capabilities"],
    workflow: ["verify_event_and_permission", "extract_insight", "create_canonical_asset", "adapt_with_distribution_engine", "approve_or_execute", "capture_leads", "measure"],
    decisionRules: ["never_invent_proof", "one_insight_many_native_formats", "respect_destination_rules"],
    outputs: ["case_study", "website_evidence", "local_post", "social_variants", "review_request", "sales_proof"],
    qualityChecks: ["permission_verified", "claims_traceable", "not_generic_ai_slop", "channel_native", "tracked_cta"],
    successMetrics: ["qualified_leads", "booked_jobs", "content_assisted_revenue", "gross_profit", "reviews"],
    permissions: { internalAnalysis: "automatic", externalActions: "policy", paidSpend: "explicit_approval", reputationActions: "approval_or_narrow_opt_in" }
  }
];
