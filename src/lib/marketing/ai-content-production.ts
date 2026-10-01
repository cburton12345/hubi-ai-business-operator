import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { queryPostgres } from "@/lib/db/postgres";
import { evaluateOrganicContentQuality } from "@/lib/marketing/organic-publishing-policy";
import {
  buildCapabilityShowcase,
  capabilityShowcaseBody,
  capabilityShowcaseEvidence,
  isFerocityBusinessProfile,
  type CapabilityShowcaseItem,
} from "@/lib/marketing/capability-showcase";

export type ContentConcept = {
  key: string;
  outputType:
    | "facebook_post"
    | "instagram_post"
    | "linkedin_post"
    | "x_post"
    | "tiktok_caption"
    | "gbp_post"
    | "blog_article"
    | "email_campaign"
    | "customer_spotlight"
    | "short_video_script";
  platform: string;
  format:
    | "post"
    | "story"
    | "text_video"
    | "ugc_video"
    | "b_roll_video"
    | "caption"
    | "email"
    | "article";
  title: string;
  hook: string;
  body: string;
  cta: string;
  audienceHypothesis: string;
  messageHypothesis: string;
  rationale: string;
  evidence: string[];
  requiresVisual: boolean;
  approach?: "problem_solution" | "proof" | "capability_showcase";
};

type ContentPackageResponse = {
  campaignName: string;
  strategySummary: string;
  concepts: ContentConcept[];
};

export type OrganicPerformance = {
  publishCount: number;
  engagementCount: number;
  conversationCount: number;
  leadCount: number;
  customerWins: number;
  pipelineValueCents: number;
  wonRevenueCents: number;
};

export function classifyOrganicPerformance(performance: OrganicPerformance) {
  if (
    performance.wonRevenueCents > 0 ||
    performance.customerWins > 0 ||
    performance.leadCount >= 2
  )
    return "winner" as const;
  if (
    performance.leadCount > 0 ||
    performance.conversationCount >= 2 ||
    performance.engagementCount >= 5
  )
    return "promising" as const;
  if (performance.publishCount === 0) return "untested" as const;
  if (performance.engagementCount + performance.conversationCount === 0)
    return "underperforming" as const;
  return "inconclusive" as const;
}

export function scoreOrganicEffectiveness(performance: OrganicPerformance) {
  if (performance.wonRevenueCents > 0) return 100;
  if (performance.customerWins > 0) return 90;
  if (performance.leadCount >= 2) return 80;
  if (performance.leadCount > 0) return 65;
  if (performance.conversationCount >= 2 || performance.engagementCount >= 5)
    return 50;
  if (performance.publishCount > 0) return 20;
  return null;
}

const outputTypes = new Set<ContentConcept["outputType"]>([
  "facebook_post",
  "instagram_post",
  "linkedin_post",
  "x_post",
  "tiktok_caption",
  "gbp_post",
  "blog_article",
  "email_campaign",
  "customer_spotlight",
  "short_video_script",
]);
const formats = new Set<ContentConcept["format"]>([
  "post",
  "story",
  "text_video",
  "ugc_video",
  "b_roll_video",
  "caption",
  "email",
  "article",
]);

export function normalizeContentConcepts(
  concepts: ContentConcept[],
  limit = 10,
) {
  const seen = new Set<string>();
  return concepts
    .filter(Boolean)
    .map((concept, index) => ({
      ...concept,
      key: (concept.key || `concept-${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, "-")
        .slice(0, 100),
      outputType: outputTypes.has(concept.outputType)
        ? concept.outputType
        : "facebook_post",
      format: formats.has(concept.format) ? concept.format : "post",
      title: String(concept.title || "Content concept")
        .trim()
        .slice(0, 180),
      hook: String(concept.hook || "")
        .trim()
        .slice(0, 500),
      body: String(concept.body || "")
        .trim()
        .slice(0, 12_000),
      cta: String(concept.cta || "")
        .trim()
        .slice(0, 240),
      evidence: Array.isArray(concept.evidence)
        ? concept.evidence.filter(Boolean).slice(0, 8)
        : [],
      requiresVisual: Boolean(concept.requiresVisual),
      approach:
        concept.approach === "capability_showcase" ||
        concept.approach === "proof"
          ? concept.approach
          : "problem_solution",
    }))
    .filter(
      (concept) =>
        concept.key &&
        concept.body &&
        concept.evidence.length > 0 &&
        !seen.has(concept.key) &&
        (seen.add(concept.key), true),
    )
    .slice(0, Math.max(1, Math.min(limit, 16)));
}

export function ensureCapabilityShowcaseConcept(
  concepts: ContentConcept[],
  items: CapabilityShowcaseItem[],
  title = "What Ferocity can run with you",
): ContentConcept[] {
  if (
    items.length < 3 ||
    concepts.some((concept) => concept.approach === "capability_showcase")
  )
    return concepts;
  const evidence = capabilityShowcaseEvidence(items);
  return [
    {
      key: "verified-capability-showcase",
      outputType: "linkedin_post",
      platform: "multi_platform",
      format: "post",
      title,
      hook: "More than a dashboard full of tools.",
      body: capabilityShowcaseBody(items),
      cta: "Tell Ferocity the bottleneck. It will show you what it can take on next.",
      audienceHypothesis:
        "Business owners comparing platforms or wondering what Ferocity can actually handle",
      messageHypothesis:
        "A concise, outcome-grouped capability list will clarify breadth when it also explains that Ferocity runs coordinated work under permission",
      rationale:
        "Feature lists help evaluation-stage buyers when they are verified, grouped by outcome, and framed as operated workflows instead of chores for the customer.",
      evidence,
      requiresVisual: false,
      approach: "capability_showcase",
    },
    ...concepts,
  ];
}

function fallbackPackage(
  title: string,
  whyNow: string,
  evidence: string[],
): ContentPackageResponse {
  const source = evidence.length ? evidence : [whyNow];
  return {
    campaignName: title,
    strategySummary:
      "Test useful, evidence-grounded organic messages before considering paid amplification.",
    concepts: [
      {
        key: "helpful-social-post",
        outputType: "facebook_post",
        platform: "facebook",
        format: "post",
        title: `${title}: helpful answer`,
        hook: whyNow,
        body: `${whyNow}\n\nShare one specific, useful answer grounded in the business's real expertise. Do not make unsupported claims.`,
        cta: "Ask a useful follow-up question.",
        audienceHypothesis: "People actively experiencing this problem",
        messageHypothesis:
          "Specific help earns more trust than a generic promotion",
        rationale:
          "A useful organic answer is a low-cost way to validate the message.",
        evidence: source,
        requiresVisual: false,
      },
      {
        key: "short-video-proof",
        outputType: "short_video_script",
        platform: "multi_platform",
        format: "b_roll_video",
        title: `${title}: short video`,
        hook: whyNow,
        body: `0-3s: Show the problem in a believable real-world moment.\n3-10s: Demonstrate the useful change with approved business footage or product screens.\n10-18s: Add one verified proof point.\n18-24s: Give one clear next step.`,
        cta: "Learn the next best step.",
        audienceHypothesis:
          "People who need to see the result before trusting the offer",
        messageHypothesis:
          "Showing the work and outcome will outperform a feature list",
        rationale:
          "The same concept can produce Reels, Shorts, TikTok, Stories, and a clean website cut.",
        evidence: source,
        requiresVisual: true,
      },
      {
        key: "customer-nurture-email",
        outputType: "email_campaign",
        platform: "email",
        format: "email",
        title: `${title}: nurture email`,
        hook: whyNow,
        body: `Subject: A useful way to think about ${title}\n\nExplain the problem, one practical insight, and the most appropriate next step. Keep the message specific and grounded in the supplied evidence.`,
        cta: "Reply with the situation you are working through.",
        audienceHypothesis: "Existing leads or customers with relevant needs",
        messageHypothesis:
          "A useful answer will restart qualified conversations",
        rationale:
          "Email tests the message with an owned audience without ad spend.",
        evidence: source,
        requiresVisual: false,
      },
    ],
  };
}

function draftTypeForConcept(outputType: ContentConcept["outputType"]) {
  if (outputType === "short_video_script") return "video_script";
  if (outputType === "blog_article") return "blog";
  if (outputType === "email_campaign") return "email";
  return outputType;
}

export async function prepareAiContentPackage(input: {
  tenantId: string;
  recommendationId: string;
  userId?: string | null;
}) {
  const source = await queryPostgres<{
    id: string;
    brand_id: string;
    title: string;
    trigger_reason: string;
    evidence_json: string[];
    opportunity_category: string;
    recommended_channels: string[];
  }>(
    `select id, brand_id, title, trigger_reason, evidence_json, opportunity_category, recommended_channels from public.marketing_campaign_recommendations where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.recommendationId],
  );
  const recommendation = source?.rows[0];
  if (!recommendation?.brand_id)
    throw new Error("Growth recommendation not found or has no brand.");
  const existing = await queryPostgres<{ id: string }>(
    `select id from public.content_studio_campaigns where tenant_id=$1 and source_recommendation_id=$2 and status <> 'archived' limit 1`,
    [input.tenantId, recommendation.id],
  );
  if (existing?.rows[0])
    return { campaignId: existing.rows[0].id, created: false, outputs: 0 };

  const [profile, memory, assets, conversations, entitlements] =
    await Promise.all([
      queryPostgres(
        `select company_name, website_url, brand_voice, ideal_customers, services_json, service_areas_json, offers_json, reviews_json, audience_json, positioning_json, proof_json, marketing_rules_json from public.marketing_os_business_profiles where tenant_id=$1 and brand_id=$2 and status <> 'archived' limit 1`,
        [input.tenantId, recommendation.brand_id],
      ),
      queryPostgres(
        `select memory_type, title, summary, confidence_score, evidence_json from public.marketing_memory_items where tenant_id=$1 and brand_id=$2 and status in ('learning','winner','needs_more_data') order by score desc, last_observed_at desc limit 40`,
        [input.tenantId, recommendation.brand_id],
      ),
      queryPostgres(
        `select id, asset_type, title, service_label, campaign_label, tags, permission_status from public.marketing_media_assets where tenant_id=$1 and brand_id=$2 and status='active' and approved_for_ai_reuse=true and permission_status='approved' order by updated_at desc limit 30`,
        [input.tenantId, recommendation.brand_id],
      ),
      queryPostgres(
        `select channel_key, detected_intent, body_excerpt, suggested_response, overall_score from public.growth_opportunities where tenant_id=$1 and brand_id=$2 and status in ('detected','scored','reviewed','queued') order by overall_score desc limit 20`,
        [input.tenantId, recommendation.brand_id],
      ),
      queryPostgres<{ feature_key: string; status: string }>(
        `select feature_key,status from public.workspace_feature_entitlements where tenant_id=$1 and status <> 'disabled' order by feature_key`,
        [input.tenantId],
      ),
    ]);
  const profileRow = profile?.rows[0] ?? null;
  const showcase = isFerocityBusinessProfile(profileRow)
    ? buildCapabilityShowcase(entitlements?.rows ?? [])
    : [];
  const evidence = {
    recommendation,
    profile: profileRow,
    memory: memory?.rows ?? [],
    approvedAssets: assets?.rows ?? [],
    conversations: conversations?.rows ?? [],
    verifiedCapabilityShowcase: capabilityShowcaseEvidence(showcase),
  };
  const fallback = fallbackPackage(
    recommendation.title,
    recommendation.trigger_reason,
    recommendation.evidence_json ?? [],
  );
  const generated = await generateJsonWithAiService<
    ContentPackageResponse & Record<string, unknown>
  >({
    tenantId: input.tenantId,
    brandId: recommendation.brand_id,
    userId: input.userId ?? null,
    featureKey: "content_studio",
    runType: "organic_content_package",
    system:
      "You are Ferocity's evidence-led content production director. Return JSON only with campaignName, strategySummary, and concepts. Produce genuinely platform-native variations, including useful posts and, where appropriate, Reels/Shorts/TikTok scripts, AI UGC concepts, B-roll concepts, Stories, text-style video, email, or an article. Use only supplied evidence and approved assets. Never invent customers, results, reviews, product behavior, credentials, prices, scarcity, urgency, connections, or claims. Use ethical persuasion: relevance, useful specificity, verified proof, clear options, and a proportionate next step. Never use shame, fear, pressure, fake social proof, or dark patterns. Match the message to the audience's actual stage and problem. Optimize for organic usefulness and message validation before paid amplification. Every concept must cite at least one supplied evidence string. Feature/tool lists are appropriate for evaluation, comparison, retargeting, sales follow-up, launches, and product education—not every top-of-funnel message. When verifiedCapabilityShowcase is supplied, include at least one concise capability_showcase concept, group capabilities by business outcome, and explain that Ferocity coordinates or runs authorized work rather than handing the customer more tools. Never imply a provider is connected or an outside action is autonomous unless the evidence says so.",
    user: `Create 6-10 varied content concepts from this evidence. Each needs key, outputType, platform, format, title, hook, body, cta, audienceHypothesis, messageHypothesis, rationale, evidence, requiresVisual, and approach (problem_solution, proof, or capability_showcase). Evidence:\n${JSON.stringify(evidence)}`,
    fallback: fallback as ContentPackageResponse & Record<string, unknown>,
    temperature: 0.55,
    metadata: { sourceRecommendationId: recommendation.id, organicFirst: true },
  });
  const concepts = normalizeContentConcepts(
    ensureCapabilityShowcaseConcept(
      generated.concepts ?? fallback.concepts,
      showcase,
    ),
  );
  const campaign = await queryPostgres<{ id: string }>(
    `insert into public.content_studio_campaigns (tenant_id, brand_id, prompt, campaign_name, goal, status, mode, approval_required, output_count, metadata_json, created_by_user_id, strategy_origin, source_recommendation_id, research_snapshot_json, learning_status) values ($1,$2,$3,$4,'validate_organic_messages','needs_review','advanced',true,$5,$6::jsonb,$7,'growth_department',$8,$9::jsonb,'collecting') returning id`,
    [
      input.tenantId,
      recommendation.brand_id,
      recommendation.trigger_reason,
      generated.campaignName?.slice(0, 180) || recommendation.title,
      concepts.length,
      JSON.stringify({
        strategySummary: generated.strategySummary,
        organicFirst: true,
        noPaidSpendAuthorized: true,
        capabilityShowcaseIncluded: concepts.some(
          (concept) => concept.approach === "capability_showcase",
        ),
      }),
      input.userId ?? null,
      recommendation.id,
      JSON.stringify(evidence),
    ],
  );
  const campaignId = campaign?.rows[0]?.id;
  if (!campaignId) throw new Error("Content campaign could not be created.");

  for (const concept of concepts) {
    const quality = evaluateOrganicContentQuality({
      title: concept.title,
      body: `${concept.hook}\n${concept.body}\n${concept.cta}`,
      sourceFactCount: concept.evidence.length,
      approvedAssetCount: assets?.rows.length ?? 0,
      requiresVisual: concept.requiresVisual,
      claimsVerified: false,
    });
    const output = await queryPostgres<{ id: string }>(
      `insert into public.content_studio_outputs (tenant_id, brand_id, campaign_id, output_type, platform, title, body, status, risk_level, metadata_json, content_key, variant_group_key, audience_hypothesis, message_hypothesis, organic_validation_status, performance_json, paid_amplification_status) values ($1,$2,$3,$4,$5,$6,$7,'needs_review',$8,$9::jsonb,$10,$11,$12,$13,'untested','{}'::jsonb,'not_eligible') on conflict (tenant_id, content_key) where content_key is not null do nothing returning id`,
      [
        input.tenantId,
        recommendation.brand_id,
        campaignId,
        concept.outputType,
        concept.platform,
        concept.title,
        `${concept.hook}\n\n${concept.body}\n\n${concept.cta}`,
        quality.status === "blocked" ? "high" : "medium",
        JSON.stringify({
          format: concept.format,
          approach: concept.approach,
          rationale: concept.rationale,
          evidence: concept.evidence,
          requiresVisual: concept.requiresVisual,
          organicFirst: true,
          quality,
        }),
        `growth-content:${recommendation.id}:${concept.key}`,
        `growth-recommendation:${recommendation.id}`,
        concept.audienceHypothesis,
        concept.messageHypothesis,
      ],
    );
    const outputId = output?.rows[0]?.id;
    if (!outputId) continue;
    const draft = await queryPostgres<{ id: string }>(
      `insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level) values ($1,$2,$3,$4,$5,$6::jsonb,'needs_review',$7) returning id`,
      [
        input.tenantId,
        recommendation.brand_id,
        draftTypeForConcept(concept.outputType),
        concept.title,
        `${concept.hook}\n\n${concept.body}\n\n${concept.cta}`,
        JSON.stringify({
          source: "ai_content_production",
          contentStudioOutputId: outputId,
          campaignId,
          organicFirst: true,
        }),
        quality.status === "blocked" ? "high" : "medium",
      ],
    );
    if (draft?.rows[0])
      await queryPostgres(
        `insert into public.content_quality_reviews (tenant_id, brand_id, draft_id, quality_status, usefulness_score, local_relevance_score, originality_score, conversion_clarity_score, risk_flags, metadata_json) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::jsonb) on conflict (draft_id) do nothing`,
        [
          input.tenantId,
          recommendation.brand_id,
          draft.rows[0].id,
          quality.status,
          quality.scores.usefulness,
          quality.scores.relevance,
          quality.scores.originality,
          quality.scores.conversionClarity,
          quality.riskFlags,
          JSON.stringify({
            contentStudioOutputId: outputId,
            organicValidation: true,
          }),
        ],
      );
    if (concept.outputType === "short_video_script")
      await queryPostgres(
        `insert into public.marketing_video_jobs (tenant_id, brand_id, campaign_id, provider_key, goal, status, script_text, cta_text, provider_request_json, metadata_json) values ($1,$2,$3,'provider_not_selected',$4,'needs_review',$5,$6,$7::jsonb,$8::jsonb)`,
        [
          input.tenantId,
          recommendation.brand_id,
          campaignId,
          concept.messageHypothesis,
          concept.body,
          concept.cta,
          JSON.stringify({
            providerReady: false,
            format: concept.format,
            platform: concept.platform,
            approvedAssetIds: (assets?.rows ?? []).map(
              (row: Record<string, unknown>) => row.id,
            ),
            noProviderSubmitted: true,
          }),
          JSON.stringify({
            contentStudioOutputId: outputId,
            organicFirst: true,
            approvalRequired: true,
          }),
        ],
      );
  }
  await queryPostgres(
    `update public.marketing_campaign_recommendations set status='turned_into_campaign', campaign_id=$3, execution_status='prepared', updated_at=now() where tenant_id=$1 and id=$2`,
    [input.tenantId, recommendation.id, campaignId],
  );
  return { campaignId, created: true, outputs: concepts.length };
}

export async function evaluateOrganicContentWinners(input: {
  tenantId: string;
}) {
  const outputs = await queryPostgres<{
    id: string;
    brand_id: string;
    campaign_id: string;
    title: string;
    organic_validation_status: string;
  }>(
    `select id, brand_id, campaign_id, title, organic_validation_status from public.content_studio_outputs where tenant_id=$1 and status <> 'archived' and organic_validation_status in ('untested','testing','promising','inconclusive') order by updated_at asc limit 200`,
    [input.tenantId],
  );
  let winners = 0;
  for (const output of outputs?.rows ?? []) {
    const reference = `content_output:${output.id}`;
    const metrics = await queryPostgres<{
      publish_count: number;
      engagement_count: number;
      conversation_count: number;
      lead_count: number;
      customer_wins: number;
      pipeline_value_cents: number;
      won_revenue_cents: number;
    }>(
      `with refs as (select $2::text as reference union select $3::text union select id::text from public.ai_drafts where tenant_id=$1 and metadata_json->>'contentStudioOutputId'=$3 union select 'ai_draft:' || id::text from public.ai_drafts where tenant_id=$1 and metadata_json->>'contentStudioOutputId'=$3) select count(*) filter (where event_type='publish_succeeded')::int as publish_count, count(*) filter (where event_type='inbound_engagement')::int as engagement_count, count(*) filter (where event_type='conversation_started')::int as conversation_count, count(*) filter (where event_type='lead_created')::int as lead_count, count(*) filter (where event_type='customer_won')::int as customer_wins, coalesce((select sum(pipeline_value_cents)::int from public.growth_attribution_touches where tenant_id=$1 and content_reference in (select reference from refs)),0) as pipeline_value_cents, coalesce((select sum(won_revenue_cents)::int from public.growth_attribution_touches where tenant_id=$1 and content_reference in (select reference from refs)),0) as won_revenue_cents from public.growth_events where tenant_id=$1 and content_reference in (select reference from refs)`,
      [input.tenantId, reference, output.id],
    );
    const performance = metrics?.rows[0];
    const normalized: OrganicPerformance = {
      publishCount: Number(performance?.publish_count ?? 0),
      engagementCount: Number(performance?.engagement_count ?? 0),
      conversationCount: Number(performance?.conversation_count ?? 0),
      leadCount: Number(performance?.lead_count ?? 0),
      customerWins: Number(performance?.customer_wins ?? 0),
      pipelineValueCents: Number(performance?.pipeline_value_cents ?? 0),
      wonRevenueCents: Number(performance?.won_revenue_cents ?? 0),
    };
    const status = classifyOrganicPerformance(normalized);
    const effectiveness = scoreOrganicEffectiveness(normalized);
    await queryPostgres(
      `update public.content_studio_outputs set organic_validation_status=$3, performance_json=$4::jsonb, validated_at=case when $3 in ('winner','underperforming','inconclusive') then now() else validated_at end, paid_amplification_status=case when $3='winner' then 'eligible' else paid_amplification_status end, updated_at=now() where tenant_id=$1 and id=$2`,
      [input.tenantId, output.id, status, JSON.stringify(normalized)],
    );
    await queryPostgres(
      `update public.marketing_campaign_recommendations recommendation set execution_status=case when $3='untested' then recommendation.execution_status else 'measuring' end, effectiveness_score=$4, last_measured_at=now(), learning_json=recommendation.learning_json || $5::jsonb, updated_at=now() from public.content_studio_campaigns campaign where campaign.tenant_id=$1 and campaign.id=$2 and recommendation.tenant_id=campaign.tenant_id and recommendation.id=campaign.source_recommendation_id`,
      [
        input.tenantId,
        output.campaign_id,
        status,
        effectiveness,
        JSON.stringify({
          organicValidationStatus: status,
          performance: normalized,
          contentOutputId: output.id,
        }),
      ],
    );
    if (status !== "winner") continue;
    winners += 1;
    await queryPostgres(
      `insert into public.marketing_campaign_recommendations (tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal, recommended_channels, expected_impact, difficulty, priority_score, status, source_signals_json, campaign_id, metadata_json, opportunity_category, recommended_action_key, owner_involvement, organic_first, estimated_value_cents, confidence_score, evidence_json, expires_at) values ($1,$2,$3,$4,$5,'amplify_proven_content','{}'::text[],$6,'medium',90,'needs_review',$7::jsonb,$8,$9::jsonb,'content','review_paid_amplification','approval',true,$10,90,$11::jsonb,now()+interval '30 days') on conflict (tenant_id, brand_id, recommendation_key) do update set trigger_reason=excluded.trigger_reason, source_signals_json=excluded.source_signals_json, metadata_json=excluded.metadata_json, estimated_value_cents=excluded.estimated_value_cents, evidence_json=excluded.evidence_json, updated_at=now()`,
      [
        input.tenantId,
        output.brand_id,
        `amplify-organic-winner:${output.id}`,
        `Consider amplifying proven winner: ${output.title}`,
        "This content produced a verified customer, lead, or revenue signal organically. Review economics and audience fit before spending.",
        "Use the proven message as a paid-test candidate, not as permission to spend.",
        JSON.stringify(normalized),
        output.campaign_id,
        JSON.stringify({
          contentOutputId: output.id,
          paidSpendRequired: true,
          paidSpendAuthorized: false,
          organicWinner: true,
        }),
        normalized.wonRevenueCents || normalized.pipelineValueCents || null,
        JSON.stringify([
          `${normalized.leadCount} attributed leads`,
          `${normalized.customerWins} customer wins`,
          `$${(normalized.wonRevenueCents / 100).toFixed(2)} won revenue`,
        ]),
      ],
    );
  }
  return { evaluated: outputs?.rows.length ?? 0, winners };
}
