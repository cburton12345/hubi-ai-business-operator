"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { normalizeFunnelStrategy, type FunnelStrategyPlan } from "@/lib/ai/funnel-strategy";
import { directVideoMarketingAsset } from "@/lib/ai/video-service";
import { queryPostgres } from "@/lib/db/postgres";
import { processWebsiteImport } from "@/lib/marketing-os/website-import-processor";
import { activateFunnelOperations } from "@/lib/revenue-growth/activate-funnel-operations";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const brandSchema = z.object({
  brandId: z.string().uuid().optional()
});

const websiteImportSchema = z.object({
  brandId: z.string().uuid().optional(),
  websiteUrl: z.string().url().max(500)
});

const advertisingDestinationSchema = z.object({
  brandId: z.string().uuid().optional(),
  displayName: z.string().trim().min(2).max(80),
  websiteUrl: z.string().trim().url().max(500),
  destinationType: z.enum(["social", "community", "directory", "marketplace", "ad_network", "publisher", "website", "other"]),
  connectionMode: z.enum(["manual_export", "byo_credentials", "oauth_or_api_future"]),
  notes: z.string().trim().max(500).optional()
});

const knownAdPlatformSchema = z.enum(["facebook", "instagram", "google", "tiktok", "youtube", "reddit", "microsoft"]);
const customAdPlatformSchema = z.string().regex(/^custom__[a-z0-9][a-z0-9_-]{1,60}$/);
const selectedAdPlatformSchema = z.union([knownAdPlatformSchema, customAdPlatformSchema]);

const processWebsiteImportSchema = z.object({
  importId: z.string().uuid()
});

const contentCampaignSchema = z.object({
  brandId: z.string().uuid().optional(),
  prompt: z.string().trim().min(4).max(1000),
  campaignName: z.string().trim().min(2).max(160).optional()
});

const adLaunchKitSchema = z.object({
  brandId: z.string().uuid().optional(),
  goal: z.string().trim().min(4).max(260),
  productOrServiceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  serviceLabel: z.string().trim().max(160).optional(),
  offerLabel: z.string().trim().max(160).optional(),
  audience: z.string().trim().max(220).optional(),
  platforms: z.array(selectedAdPlatformSchema).min(1).max(20),
  budgetDollars: z.coerce.number().min(0).max(250000).default(0),
  variantCount: z.coerce.number().int().min(3).max(10)
});

const adAutopilotPackageSchema = z.object({
  brandId: z.string().uuid().optional(),
  businessThought: z.string().trim().min(4).max(900),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  serviceLabel: z.string().trim().max(160).optional(),
  offerLabel: z.string().trim().max(160).optional(),
  audience: z.string().trim().max(220).optional(),
  sourceAssets: z.string().trim().max(1000).optional(),
  platforms: z.array(selectedAdPlatformSchema).min(1).max(20),
  publishMode: z.enum(["draft_only", "approval_required", "auto_when_connected"]),
  budgetDollars: z.coerce.number().min(0).max(250000).default(0),
  durationSeconds: z.coerce.number().int().min(6).max(90)
});

const oneClickCampaignSchema = z.object({
  brandId: z.string().uuid().optional(),
  campaignKey: z.string().trim().min(2).max(100)
});

const graphicJobSchema = z.object({
  brandId: z.string().uuid().optional(),
  jobType: z.enum(["review_graphic", "before_after", "image_ad"]),
  serviceLabel: z.string().trim().max(160).optional(),
  serviceArea: z.string().trim().max(160).optional()
});

const videoJobSchema = z.object({
  brandId: z.string().uuid().optional(),
  serviceLabel: z.string().trim().max(160).optional(),
  goal: z.string().trim().min(2).max(240),
  offerLabel: z.string().trim().max(160).optional(),
  platform: z.enum(["facebook", "instagram", "tiktok", "youtube", "reddit", "google_display", "ctv", "multi_platform"]),
  durationSeconds: z.coerce.number().int().min(6).max(90),
  audience: z.string().trim().max(220).optional(),
  sourceAssets: z.string().trim().max(800).optional(),
  variantCount: z.coerce.number().int().min(1).max(5)
});

async function firstBrandId(workspaceId: string, preferredBrandId?: string) {
  if (preferredBrandId) return preferredBrandId;
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.brands
    where tenant_id = $1 and status <> 'archived'
    order by created_at asc
    limit 1
    `,
    [workspaceId]
  );
  return result?.rows[0]?.id ?? null;
}

function titleFromPrompt(prompt: string) {
  return prompt
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ")
    .trim() || "Marketing campaign";
}

type AdPlatform = z.infer<typeof adLaunchKitSchema>["platforms"][number];

type MarketingPlatformPlaybook = {
  platform_key: string;
  display_name: string;
  strategy_summary: string;
  creative_rules_json: unknown[];
  asset_requirements_json: Record<string, unknown>;
  testing_rules_json: Record<string, unknown>;
  avoid_json: unknown[];
  source_urls_json: unknown[];
};

type AdAutopilotPackageInput = z.infer<typeof adAutopilotPackageSchema>;

function videoPlatformFromAdPlatforms(platforms: AdPlatform[]) {
  if (platforms.length !== 1) return "multi_platform";
  const [platform] = platforms;
  if (platform === "google" || platform === "microsoft") return "google_display";
  return platform;
}

function playbookKeyForPlatform(platform: AdPlatform) {
  return platform === "facebook" || platform === "instagram" ? "meta" : platform;
}

function platformLabel(platform: AdPlatform) {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    google: "Google",
    tiktok: "TikTok",
    youtube: "YouTube",
    reddit: "Reddit",
    microsoft: "Microsoft"
  };
  if (labels[platform]) return labels[platform];
  if (platform.startsWith("custom__")) {
    return platform
      .slice("custom__".length)
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return platform.replaceAll("_", " ");
}

function formatForPlatform(platform: AdPlatform, index: number) {
  if (platform === "google" || platform === "microsoft") return "search_ad";
  if (platform === "youtube") return "short_video_script";
  if (platform === "tiktok") return index % 2 === 0 ? "ugc_video_script" : "short_video_script";
  if (platform === "reddit") return index % 2 === 0 ? "caption" : "static_ad";
  if (platform === "instagram") return index % 2 === 0 ? "story_ad" : "ugc_video_script";
  return index % 3 === 0 ? "ugc_video_script" : "static_ad";
}

function customPlatformKey(displayName: string) {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 52);
  return `custom__${slug || "destination"}`;
}

async function customPlatformsBelongToWorkspace(workspaceId: string, platforms: AdPlatform[]) {
  const customKeys = platforms.filter((platform) => platform.startsWith("custom__"));
  if (customKeys.length === 0) return true;
  const result = await queryPostgres<{ platform_key: string }>(
    `
    select platform_key
    from public.marketing_advertising_destinations
    where tenant_id = $1
      and platform_key = any($2::text[])
      and status = 'active'
    `,
    [workspaceId, customKeys]
  );
  return new Set(result?.rows.map((row) => row.platform_key) ?? []).size === new Set(customKeys).size;
}

export async function saveAdvertisingDestinationAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = advertisingDestinationSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    displayName: formData.get("displayName"),
    websiteUrl: formData.get("websiteUrl"),
    destinationType: formData.get("destinationType"),
    connectionMode: formData.get("connectionMode"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const platformKey = customPlatformKey(parsed.data.displayName);
  await queryPostgres(
    `
    insert into public.marketing_advertising_destinations (
      tenant_id, brand_id, platform_key, display_name, website_url, destination_type,
      connection_mode, status, notes, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9::jsonb)
    on conflict (tenant_id, platform_key) do update set
      brand_id = excluded.brand_id,
      display_name = excluded.display_name,
      website_url = excluded.website_url,
      destination_type = excluded.destination_type,
      connection_mode = excluded.connection_mode,
      status = 'active',
      notes = excluded.notes,
      metadata_json = public.marketing_advertising_destinations.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      workspaceId,
      brandId,
      platformKey,
      parsed.data.displayName,
      parsed.data.websiteUrl,
      parsed.data.destinationType,
      parsed.data.connectionMode,
      parsed.data.notes ?? "",
      JSON.stringify({ customDestination: true, livePublishingEnabled: false, reviewRequired: true })
    ]
  );
  revalidateMarketingOs();
}

function hookForPlatform(platform: AdPlatform, angle: string, fallbackHook: string, serviceLabel?: string, offerLabel?: string) {
  const service = serviceLabel || "this";
  const offer = offerLabel || "get a clear next step";
  if (platform === "google" || platform === "microsoft") return `${service}: ${offer}`;
  if (platform === "tiktok") return `POV: you need ${service} handled before it gets expensive.`;
  if (platform === "youtube") return `Before you spend money on ${service}, watch this.`;
  if (platform === "reddit") return `Honest question: what would make you trust someone for ${service}?`;
  if (platform === "instagram") return `Real proof beats guessing: ${service}`;
  if (platform === "facebook") return angle === "Local Trust" ? `Local ${service} help with real proof.` : fallbackHook;
  return fallbackHook;
}

function fallbackFunnelStrategy(input: AdAutopilotPackageInput): FunnelStrategyPlan {
  const service = input.serviceLabel || "the offer";
  const audience = input.audience || "qualified prospects";
  const cta = input.offerLabel || "Request a clear next step";

  return {
    funnelName: `${titleFromPrompt(input.businessThought)} funnel`,
    positioning: `Turn ${audience} into tracked, qualified leads for ${service} without publishing or spending before review.`,
    headline: `${service}: get a clear plan before you commit`,
    shortDemoHook: `If ${service} feels expensive, confusing, or easy to put off, this shows the next best step in under ${input.durationSeconds} seconds.`,
    qualificationQuestions: [
      "What problem are you trying to solve?",
      "Where are you located or what area needs service?",
      "How soon do you want this handled?",
      "Have you worked with anyone on this already?",
      "What is the best phone or email for follow-up?"
    ],
    followUpPlan: [
      "Send a fast first response with the requested next step.",
      "If no reply, remind once the same day while the lead is warm.",
      "Send one helpful proof or FAQ follow-up before asking again.",
      "Stop after the approved follow-up cap unless the customer replies."
    ],
    trackingPlan: [
      "Track source, platform, campaign, offer, service, area, and form answers.",
      "Connect each lead to estimate, job, invoice, payment, review, and revenue when available.",
      "Compare platforms by booked work, not just clicks or form fills."
    ],
    creativeAngles: [
      { angle: "Problem", hook: input.businessThought, cta },
      { angle: "Proof", hook: input.sourceAssets ? "Use approved proof from the supplied assets." : "Collect proof before publishing the strongest version.", cta },
      { angle: "Offer", hook: cta, cta },
      { angle: "Local Trust", hook: `Show why ${service} feels safe to choose.`, cta },
      { angle: "Urgency", hook: "Give people a reason to act now without fake scarcity.", cta }
    ],
    safetyChecks: [
      "Do not invent reviews, pricing, guarantees, credentials, or results.",
      "Keep publishing, ad spend, customer sends, and rendered video behind approval.",
      "Confirm business facts, service area, claims, and consent before launch."
    ],
    recommendedNextAction: "Review the funnel package, answer missing business facts, then approve only the assets and platforms that should go live."
  };
}

function listForPrompt(title: string, items: string[]) {
  if (!items.length) return `${title}: none`;
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function formatFunnelStrategyForPrompt(strategy: FunnelStrategyPlan) {
  return [
    `AI funnel plan: ${strategy.funnelName}`,
    `Positioning: ${strategy.positioning}`,
    `Headline: ${strategy.headline}`,
    `Short video hook: ${strategy.shortDemoHook}`,
    listForPrompt("Qualification questions", strategy.qualificationQuestions),
    listForPrompt("Follow-up plan", strategy.followUpPlan),
    listForPrompt("Tracking plan", strategy.trackingPlan),
    listForPrompt("Creative angles", strategy.creativeAngles.map((item) => `${item.angle}: ${item.hook} CTA: ${item.cta}`)),
    listForPrompt("Safety checks", strategy.safetyChecks),
    `Recommended next action: ${strategy.recommendedNextAction}`
  ].join("\n");
}

async function insertDraftOutputs(workspaceId: string, brandId: string | null, campaignId: string, prompt: string, outputTypes: string[]) {
  if (!brandId) return;

  const rows = outputTypes.map((type) => ({
    outputType: type,
    title: `${type.replaceAll("_", " ")} draft`,
    body: `Draft prepared from: ${prompt}. Review business facts, offer details, claims, service area, and approval rules before use.`
  }));

  for (const item of rows) {
    const outputResult = await queryPostgres<{ id: string }>(
      `
      insert into public.content_studio_outputs (tenant_id, brand_id, campaign_id, output_type, platform, title, body, status, risk_level, metadata_json)
      values ($1, $2, $3, $4, $5, $6, $7, 'needs_review', 'medium', $8::jsonb)
      returning id
      `,
      [
        workspaceId,
        brandId,
        campaignId,
        item.outputType,
        platformFor(item.outputType),
        item.title,
        item.body,
        JSON.stringify({ generatedBy: "deterministic_setup", noTokenSpend: true })
      ]
    );
    const outputId = outputResult?.rows[0]?.id;

    const draftResult = await queryPostgres<{ id: string }>(
      `
      insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level)
      values ($1, $2, $3, $4, $5, $6::jsonb, 'needs_review', 'medium')
      returning id
      `,
      [
        workspaceId,
        brandId,
        draftTypeFor(item.outputType),
        item.title,
        item.body,
        JSON.stringify({ source: "marketing_os", contentStudioOutputId: outputId, campaignId })
      ]
    );
    const draftId = draftResult?.rows[0]?.id ?? null;

    const calendarResult = await queryPostgres<{ id: string }>(
      `
      insert into public.marketing_calendar_items (tenant_id, brand_id, source_type, source_id, title, item_type, status, risk_level, notes, metadata_json)
      values ($1, $2, 'ai_draft', $3, $4, $5, 'draft', 'medium', $6, $7::jsonb)
      returning id
      `,
      [
        workspaceId,
        brandId,
        draftId,
        item.title,
        calendarTypeFor(item.outputType),
        "Created from Marketing OS. Schedule after review.",
        JSON.stringify({ source: "marketing_os", contentStudioOutputId: outputId, campaignId })
      ]
    );
    const calendarId = calendarResult?.rows[0]?.id ?? null;

    await queryPostgres(
      `
      insert into public.review_first_export_queue (
        tenant_id, brand_id, export_type, provider_key, target_label, title, body, status, risk_level, source_table, source_id, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'needs_review', 'medium', 'content_studio_outputs', $8, $9::jsonb)
      `,
      [
        workspaceId,
        brandId,
        exportTypeFor(item.outputType),
        providerFor(item.outputType),
        platformFor(item.outputType),
        item.title,
        item.body,
        outputId,
        JSON.stringify({ source: "marketing_os", campaignId, aiDraftId: draftId, calendarItemId: calendarId })
      ]
    );

    if (outputId) {
      await queryPostgres(
        `
        update public.content_studio_outputs
        set source_ai_draft_id = $3,
            source_calendar_item_id = $4,
            metadata_json = metadata_json || $5::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          workspaceId,
          outputId,
          draftId,
          calendarId,
          JSON.stringify({ reviewDraftCreated: Boolean(draftId), calendarItemCreated: Boolean(calendarId), exportQueueCreated: true })
        ]
      );
    }
  }

  await queryPostgres(
    `
    update public.content_studio_campaigns
    set output_count = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, campaignId, rows.length]
  );
}

function draftTypeFor(outputType: string) {
  if (outputType === "blog_article") return "blog";
  if (outputType === "gbp_post") return "gbp_post";
  if (outputType === "landing_page") return "landing_page";
  if (["city_page", "service_page", "case_study", "customer_spotlight"].includes(outputType)) return "landing_page";
  if (outputType === "email_campaign") return "email";
  if (outputType === "sms_campaign") return "sms";
  if (outputType.includes("video")) return "video_script";
  if (outputType === "ad_copy" || outputType === "image_ad" || outputType.includes("ad")) return "facebook_ad";
  if (outputType.includes("facebook") || outputType.includes("instagram") || outputType.includes("linkedin") || outputType === "x_post" || outputType.includes("tiktok")) {
    return "facebook_post";
  }
  if (outputType.includes("review")) return "gbp_post";
  return "landing_page";
}

function calendarTypeFor(outputType: string) {
  const draftType = draftTypeFor(outputType);
  if (draftType === "blog") return "seo_blog";
  if (draftType === "email" || draftType === "sms") return outputType.includes("review") ? "review_request" : "lead_followup";
  return draftType;
}

function exportTypeFor(outputType: string) {
  if (outputType.includes("video")) return "video_brief";
  if (outputType === "gbp_post") return "gbp_post";
  if (outputType.includes("review")) return "review_reply";
  if (outputType.includes("ad") || outputType.includes("facebook") || outputType.includes("instagram") || outputType.includes("tiktok") || outputType.includes("youtube") || outputType.includes("microsoft")) return "ad_creative";
  if (["landing_page", "city_page", "service_page", "case_study", "customer_spotlight", "blog_article"].includes(outputType) || outputType.includes("seo")) return "website_page";
  if (outputType === "email_campaign") return "email_campaign";
  if (outputType === "sms_campaign") return "sms_campaign";
  return "other";
}

function providerFor(outputType: string) {
  if (outputType.includes("video")) return "manual_export";
  if (outputType === "gbp_post" || outputType.includes("review")) return "google_business_profile";
  if (outputType.includes("google")) return "google_ads";
  if (outputType.includes("microsoft")) return "microsoft_ads";
  if (outputType.includes("reddit")) return "reddit_ads";
  if (outputType.includes("tiktok")) return "tiktok_ads";
  if (outputType.includes("youtube")) return "youtube_ads";
  if (outputType.includes("facebook") || outputType.includes("instagram") || outputType.includes("ad")) return "meta";
  if (["landing_page", "city_page", "service_page", "case_study", "customer_spotlight", "blog_article"].includes(outputType)) return "website_connector";
  if (outputType === "email_campaign") return "email_provider";
  if (outputType === "sms_campaign") return "twilio";
  return "manual_export";
}

function platformFor(outputType: string) {
  if (outputType.includes("video")) return "video";
  if (outputType.includes("youtube")) return "youtube";
  if (outputType.includes("reddit")) return "reddit";
  if (outputType.includes("google")) return "google";
  if (outputType.includes("microsoft")) return "microsoft";
  if (outputType.includes("facebook")) return "facebook";
  if (outputType.includes("instagram")) return "instagram";
  if (outputType.includes("linkedin")) return "linkedin";
  if (outputType === "x_post") return "x";
  if (outputType.includes("tiktok")) return "tiktok";
  if (outputType.includes("gbp")) return "google_business_profile";
  if (outputType.includes("email")) return "email";
  if (outputType.includes("sms")) return "sms";
  if (outputType.includes("landing") || outputType.includes("page") || outputType.includes("case_study")) return "website";
  return "manual";
}

export async function refreshBusinessProfileMemoryAction(formData: FormData) {
  await requirePermission("brand:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = brandSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined
  });
  const brandId = await firstBrandId(workspaceId, parsed.success ? parsed.data.brandId : undefined);
  if (!brandId) return;

  await queryPostgres(
    `
    insert into public.marketing_os_business_profiles (
      tenant_id, brand_id, company_name, website_url, primary_phone, primary_email, brand_voice, ideal_customers,
      services_json, service_areas_json, social_links_json, faqs_json, offers_json, reviews_json, uploaded_assets_json,
      brand_identity_json, audience_json, positioning_json, proof_json, seasonality_json, capacity_json, marketing_rules_json,
      source, status, last_refreshed_at, metadata_json
    )
    select
      b.tenant_id,
      b.id,
      b.name,
      b.domain,
      b.phone,
      b.email,
      coalesce(ms.tone_of_voice, 'Clear, helpful, local, trustworthy'),
      coalesce(ms.target_customers, b.primary_goal, 'Local service customers'),
      coalesce((
        select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'priority', s.priority))
        from public.brand_services s
        where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('name', coalesce(l.service_area_name, concat_ws(', ', l.city, l.state)), 'city', l.city, 'state', l.state, 'priority', l.priority))
        from public.brand_locations l
        where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.active = true
      ), '[]'::jsonb),
      '{}'::jsonb,
      '[]'::jsonb,
      coalesce((
        select jsonb_agg(jsonb_build_object('title', o.title, 'description', o.description))
        from public.brand_offers o
        where o.tenant_id = b.tenant_id and o.brand_id = b.id and o.active = true
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('title', u.title, 'rating', u.rating, 'city', u.city, 'story', u.story_text))
        from public.ugc_submissions u
        where u.tenant_id = b.tenant_id and u.brand_id = b.id and u.status in ('approved','needs_review')
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('title', a.title, 'type', a.asset_type, 'approvedForAiReuse', a.approved_for_ai_reuse))
        from public.marketing_media_assets a
        where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.status <> 'archived'
      ), '[]'::jsonb),
      jsonb_build_object('businessName', b.name, 'industry', b.industry, 'website', b.domain, 'phone', b.phone, 'email', b.email, 'mission', b.primary_goal),
      jsonb_build_object('idealCustomer', coalesce(ms.target_customers, b.primary_goal), 'targetDemographics', coalesce(ms.metadata_json->'targetDemographics', '[]'::jsonb)),
      jsonb_build_object('brandVoice', coalesce(ms.tone_of_voice, 'Clear, helpful, local, trustworthy'), 'offers', coalesce(ms.ad_goals, ms.cta_goals), 'competitiveAdvantages', coalesce(ms.metadata_json->'competitiveAdvantages', '[]'::jsonb)),
      jsonb_build_object('approvedAssetCount', (
        select count(*) from public.marketing_media_assets a
        where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.approved_for_ai_reuse = true and a.status <> 'archived'
      )),
      jsonb_build_object('busySeasons', coalesce(ms.metadata_json->'busySeasons', '[]'::jsonb), 'slowSeasons', coalesce(ms.metadata_json->'slowSeasons', '[]'::jsonb)),
      jsonb_build_object('crewCapacity', coalesce(ms.metadata_json->'crewCapacity', '{}'::jsonb), 'serviceRadius', coalesce(ms.metadata_json->'serviceRadius', to_jsonb(b.primary_location))),
      jsonb_build_object('approvalMode', coalesce(ms.approval_mode, 'review_required'), 'managedAdsDefault', 'customer_owned_accounts', 'avoidClaims', coalesce(ms.metadata_json->'avoidClaims', '[]'::jsonb)),
      'ferocity',
      'ready',
      now(),
      jsonb_build_object('refreshedFrom', 'brands_services_locations_proof', 'brandIntelligenceVersion', 1)
    from public.brands b
    left join public.brand_marketing_settings ms on ms.tenant_id = b.tenant_id and ms.brand_id = b.id
    where b.tenant_id = $1 and b.id = $2
    on conflict do nothing
    `,
    [workspaceId, brandId]
  );

  await queryPostgres(
    `
    update public.marketing_os_business_profiles p
    set
      company_name = b.name,
      website_url = b.domain,
      primary_phone = b.phone,
      primary_email = b.email,
      brand_voice = coalesce(ms.tone_of_voice, p.brand_voice, 'Clear, helpful, local, trustworthy'),
      ideal_customers = coalesce(ms.target_customers, b.primary_goal, p.ideal_customers),
      services_json = coalesce((
        select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'priority', s.priority))
        from public.brand_services s
        where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true
      ), '[]'::jsonb),
      service_areas_json = coalesce((
        select jsonb_agg(jsonb_build_object('name', coalesce(l.service_area_name, concat_ws(', ', l.city, l.state)), 'city', l.city, 'state', l.state, 'priority', l.priority))
        from public.brand_locations l
        where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.active = true
      ), '[]'::jsonb),
      offers_json = coalesce((
        select jsonb_agg(jsonb_build_object('title', o.title, 'description', o.description))
        from public.brand_offers o
        where o.tenant_id = b.tenant_id and o.brand_id = b.id and o.active = true
      ), '[]'::jsonb),
      uploaded_assets_json = coalesce((
        select jsonb_agg(jsonb_build_object('title', a.title, 'type', a.asset_type, 'approvedForAiReuse', a.approved_for_ai_reuse))
        from public.marketing_media_assets a
        where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.status <> 'archived'
      ), '[]'::jsonb),
      brand_identity_json = p.brand_identity_json || jsonb_build_object('businessName', b.name, 'industry', b.industry, 'website', b.domain, 'phone', b.phone, 'email', b.email, 'mission', b.primary_goal),
      audience_json = p.audience_json || jsonb_build_object('idealCustomer', coalesce(ms.target_customers, b.primary_goal)),
      positioning_json = p.positioning_json || jsonb_build_object('brandVoice', coalesce(ms.tone_of_voice, p.brand_voice, 'Clear, helpful, local, trustworthy'), 'offers', coalesce(ms.ad_goals, ms.cta_goals)),
      proof_json = p.proof_json || jsonb_build_object('approvedAssetCount', (
        select count(*) from public.marketing_media_assets a
        where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.approved_for_ai_reuse = true and a.status <> 'archived'
      )),
      marketing_rules_json = p.marketing_rules_json || jsonb_build_object('approvalMode', coalesce(ms.approval_mode, 'review_required'), 'managedAdsDefault', 'customer_owned_accounts'),
      status = 'ready',
      last_refreshed_at = now(),
      metadata_json = p.metadata_json || jsonb_build_object('refreshedFrom', 'brands_services_locations_proof', 'brandIntelligenceVersion', 1),
      updated_at = now()
    from public.brands b
    left join public.brand_marketing_settings ms on ms.tenant_id = b.tenant_id and ms.brand_id = b.id
    where p.tenant_id = $1 and p.brand_id = $2 and b.tenant_id = p.tenant_id and b.id = p.brand_id
    `,
    [workspaceId, brandId]
  );

  revalidateMarketingOs();
}

export async function createMarketingDepartmentRecommendationsAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = brandSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined
  });
  const brandId = await firstBrandId(workspaceId, parsed.success ? parsed.data.brandId : undefined);
  if (!brandId) return;

  const signals = await queryPostgres<{
    brand_name: string;
    services: string;
    areas: string;
    completed_jobs: string;
    open_jobs: string;
    stale_leads: string;
    proof_assets: string;
    unpaid_invoices: string;
  }>(
    `
    select
      b.name as brand_name,
      (select count(*) from public.brand_services s where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true)::text as services,
      (select count(*) from public.brand_locations l where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.active = true)::text as areas,
      (select count(*) from public.service_jobs j where j.tenant_id = b.tenant_id and j.brand_id = b.id and j.status = 'completed')::text as completed_jobs,
      (select count(*) from public.service_jobs j where j.tenant_id = b.tenant_id and j.brand_id = b.id and j.status in ('scheduled','in_progress'))::text as open_jobs,
      (select count(*) from public.leads l where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.status in ('new','qualified') and l.created_at < now() - interval '1 day')::text as stale_leads,
      (select count(*) from public.marketing_media_assets a where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.status <> 'archived')::text as proof_assets,
      (select count(*) from public.service_invoices i where i.tenant_id = b.tenant_id and i.brand_id = b.id and i.status in ('sent_manually','partially_paid','overdue'))::text as unpaid_invoices
    from public.brands b
    where b.tenant_id = $1 and b.id = $2
    limit 1
    `,
    [workspaceId, brandId]
  );
  const signal = signals?.rows[0];
  if (!signal) return;

  const sourceSignals = {
    services: Number(signal.services),
    areas: Number(signal.areas),
    completedJobs: Number(signal.completed_jobs),
    openJobs: Number(signal.open_jobs),
    staleLeads: Number(signal.stale_leads),
    proofAssets: Number(signal.proof_assets),
    unpaidInvoices: Number(signal.unpaid_invoices)
  };

  const recommendations = [
    {
      key: "fill_open_schedule",
      title: "Fill open schedule with profitable work",
      reason: sourceSignals.openJobs < 3 ? "The schedule looks light enough to justify a demand push." : "Keep a schedule-fill campaign ready for the next open week.",
      goal: "Book more qualified work without waiting for leads to drift in.",
      channels: ["Google Business Profile", "Facebook", "email", "website landing page"],
      outputs: ["GBP post", "Facebook post", "Google ad copy", "landing page", "email"],
      impact: "More booked appointments and fewer dead spots.",
      difficulty: "medium",
      priority: sourceSignals.openJobs < 3 ? 86 : 68
    },
    {
      key: "completed_job_proof_machine",
      title: "Turn completed jobs into proof and reviews",
      reason: sourceSignals.completedJobs > 0 || sourceSignals.proofAssets > 0 ? "Completed work and proof assets can become trust-building marketing." : "Start collecting proof so completed work can market the next job.",
      goal: "Convert real work into reviews, posts, case studies, and sales proof.",
      channels: ["reviews", "Google Business Profile", "Facebook", "website"],
      outputs: ["review request", "before/after post", "case study", "testimonial graphic"],
      impact: "Higher trust, stronger conversion, better local authority.",
      difficulty: "low",
      priority: sourceSignals.completedJobs > 0 || sourceSignals.proofAssets > 0 ? 90 : 72
    },
    {
      key: "reactivate_stale_leads",
      title: "Recover stale leads before they disappear",
      reason: sourceSignals.staleLeads > 0 ? `${sourceSignals.staleLeads} lead(s) are old enough to need follow-up.` : "Keep a reactivation campaign ready before leads age out.",
      goal: "Turn old inquiries into booked conversations.",
      channels: ["email", "manual call", "approved text draft"],
      outputs: ["follow-up email", "call list", "reply script"],
      impact: "Recover revenue from leads already paid for or earned.",
      difficulty: "low",
      priority: sourceSignals.staleLeads > 0 ? 88 : 60
    }
  ];

  for (const recommendation of recommendations) {
    await queryPostgres(
      `
      insert into public.marketing_campaign_recommendations (
        tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal,
        recommended_channels, recommended_outputs_json, expected_impact, difficulty, priority_score, source_signals_json, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb)
      on conflict (tenant_id, brand_id, recommendation_key) do update set
        title = excluded.title,
        trigger_reason = excluded.trigger_reason,
        primary_goal = excluded.primary_goal,
        recommended_channels = excluded.recommended_channels,
        recommended_outputs_json = excluded.recommended_outputs_json,
        expected_impact = excluded.expected_impact,
        difficulty = excluded.difficulty,
        priority_score = excluded.priority_score,
        source_signals_json = excluded.source_signals_json,
        metadata_json = public.marketing_campaign_recommendations.metadata_json || excluded.metadata_json,
        status = case when public.marketing_campaign_recommendations.status in ('dismissed','paused') then public.marketing_campaign_recommendations.status else 'recommended' end,
        updated_at = now()
      `,
      [
        workspaceId,
        brandId,
        recommendation.key,
        recommendation.title,
        recommendation.reason,
        recommendation.goal,
        recommendation.channels,
        JSON.stringify(recommendation.outputs),
        recommendation.impact,
        recommendation.difficulty,
        recommendation.priority,
        JSON.stringify(sourceSignals),
        JSON.stringify({ createdBy: "ai_marketing_department", noLivePublishing: true, brandName: signal.brand_name })
      ]
    );
  }

  await queryPostgres(
    `
    insert into public.marketing_memory_items (
      tenant_id, brand_id, memory_type, title, summary, source_table, performance_json, score, status, metadata_json
    )
    values
      ($1, $2, 'campaign', 'Best current marketing move', 'Use operations, proof, stale leads, service areas, and revenue signals before creating campaigns.', 'marketing_campaign_recommendations', $3::jsonb, 70, 'learning', $4::jsonb),
      ($1, $2, 'cta', 'Strong default CTA', 'Make the next step obvious: call, request quote, book, upload proof, or approve estimate.', 'marketing_os_business_profiles', $3::jsonb, 65, 'learning', $4::jsonb)
    `,
    [
      workspaceId,
      brandId,
      JSON.stringify(sourceSignals),
      JSON.stringify({ createdBy: "ai_marketing_department", noClaimsWithoutData: true })
    ]
  );

  revalidateMarketingOs();
}

export async function requestWebsiteImportAction(formData: FormData) {
  await requirePermission("brand:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = websiteImportSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    websiteUrl: formData.get("websiteUrl")
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  await queryPostgres(
    `
    insert into public.marketing_os_website_imports (tenant_id, brand_id, website_url, status, extraction_json, requested_by_user_id, metadata_json)
    values ($1, $2, $3, 'queued', $4::jsonb, $5, $6::jsonb)
    `,
    [
      workspaceId,
      brandId,
      parsed.data.websiteUrl,
      JSON.stringify({
        pendingFields: ["company_name", "services", "service_areas", "about_content", "faqs", "reviews", "contact_information", "marketing_content"]
      }),
      session?.userId ?? null,
      JSON.stringify({ queuedForSafeHtmlImport: true, reviewBeforeUse: true, noPublishing: true })
    ]
  );

  revalidateMarketingOs();
}

export async function processWebsiteImportAction(formData: FormData) {
  await requirePermission("brand:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = processWebsiteImportSchema.safeParse({
    importId: formData.get("importId")
  });
  if (!parsed.success) return;

  await processWebsiteImport(workspaceId, parsed.data.importId);
  revalidateMarketingOs();
}

export async function createContentStudioCampaignAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = contentCampaignSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    prompt: formData.get("prompt"),
    campaignName: formData.get("campaignName")?.toString() || undefined
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const campaignName = parsed.data.campaignName || titleFromPrompt(parsed.data.prompt);
  const campaignResult = await queryPostgres<{ id: string }>(
    `
    insert into public.content_studio_campaigns (tenant_id, brand_id, prompt, campaign_name, goal, status, mode, approval_required, metadata_json, created_by_user_id)
    values ($1, $2, $3, $4, 'Create reviewed marketing assets from a plain-English prompt.', 'needs_review', 'simple', true, $5::jsonb, $6)
    returning id
    `,
    [
      workspaceId,
      brandId,
      parsed.data.prompt,
      campaignName,
      JSON.stringify({ noTokenSpend: true, source: "content_studio_prompt" }),
      session?.userId ?? null
    ]
  );

  const campaignId = campaignResult?.rows[0]?.id;
  if (campaignId) {
    await insertDraftOutputs(workspaceId, brandId, campaignId, parsed.data.prompt, [
      "facebook_post",
      "instagram_post",
      "gbp_post",
      "blog_article",
      "email_campaign",
      "sms_campaign",
      "landing_page",
      "ad_copy",
      "image_ad",
      "short_video_script"
    ]);
  }

  revalidateMarketingOs();
}

export async function createAdLaunchKitAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = adLaunchKitSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    goal: formData.get("goal"),
    productOrServiceUrl: formData.get("productOrServiceUrl")?.toString() || "",
    serviceLabel: formData.get("serviceLabel")?.toString() || undefined,
    offerLabel: formData.get("offerLabel")?.toString() || undefined,
    audience: formData.get("audience")?.toString() || undefined,
    platforms: formData.getAll("platforms").map(String),
    budgetDollars: formData.get("budgetDollars") || "0",
    variantCount: formData.get("variantCount") || "5"
  });
  if (!parsed.success) return;
  if (!(await customPlatformsBelongToWorkspace(workspaceId, parsed.data.platforms))) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const campaignName = titleFromPrompt(parsed.data.goal);
  const playbookKeys = [...new Set(parsed.data.platforms.map(playbookKeyForPlatform))];
  const playbookResult = await queryPostgres<MarketingPlatformPlaybook>(
    `
    select platform_key, display_name, strategy_summary, creative_rules_json, asset_requirements_json,
      testing_rules_json, avoid_json, source_urls_json
    from public.marketing_platform_playbooks
    where platform_key = any($1::text[]) and status = 'active'
    order by display_name asc
    `,
    [playbookKeys]
  );
  const playbooksByKey = new Map((playbookResult?.rows ?? []).map((playbook) => [playbook.platform_key, playbook]));
  const playbookSummaryLines = parsed.data.platforms
    .map((platform) => {
      const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
      return playbook ? `${platformLabel(platform)} playbook: ${playbook.strategy_summary}` : `${platformLabel(platform)} playbook: use review-first channel-specific creative.`;
    })
    .join("\n");
  const prompt = [
    parsed.data.goal,
    parsed.data.serviceLabel ? `Service: ${parsed.data.serviceLabel}` : null,
    parsed.data.offerLabel ? `Offer: ${parsed.data.offerLabel}` : null,
    parsed.data.audience ? `Audience: ${parsed.data.audience}` : null,
    parsed.data.productOrServiceUrl ? `Source URL: ${parsed.data.productOrServiceUrl}` : null,
    `Platforms: ${parsed.data.platforms.join(", ")}`,
    playbookSummaryLines,
    "Create a review-first ad launch kit with multiple creative angles, a landing/sales page, static ad ideas, UGC-style video scripts, captions, and tracking notes."
  ].filter(Boolean).join("\n");

  const campaignResult = await queryPostgres<{ id: string }>(
    `
    insert into public.content_studio_campaigns (
      tenant_id, brand_id, campaign_key, prompt, campaign_name, goal, status, mode, approval_required, metadata_json, created_by_user_id
    )
    values ($1, $2, 'ad_launch_kit', $3, $4, $5, 'needs_review', 'simple', true, $6::jsonb, $7)
    returning id
    `,
    [
      workspaceId,
      brandId,
      prompt,
      campaignName,
      parsed.data.goal,
      JSON.stringify({
        source: "ad_launch_kit",
        productOrServiceUrl: parsed.data.productOrServiceUrl || null,
        serviceLabel: parsed.data.serviceLabel ?? null,
        offerLabel: parsed.data.offerLabel ?? null,
        audience: parsed.data.audience ?? null,
        platforms: parsed.data.platforms,
        platformPlaybooks: Object.fromEntries(
          parsed.data.platforms.map((platform) => {
            const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
            return [platform, playbook ? {
              displayName: playbook.display_name,
              strategySummary: playbook.strategy_summary,
              creativeRules: playbook.creative_rules_json,
              assetRequirements: playbook.asset_requirements_json,
              avoid: playbook.avoid_json,
              sourceUrls: playbook.source_urls_json
            } : null];
          })
        ),
        noLivePublishing: true
      }),
      session?.userId ?? null
    ]
  );
  const campaignId = campaignResult?.rows[0]?.id;
  if (!campaignId) return;

  const outputsByPlatform = new Set<string>([
    "landing_page",
    "image_ad",
    "short_video_script",
    "ad_copy",
    "email_campaign"
  ]);
  for (const platform of parsed.data.platforms) {
    if (platform === "google") outputsByPlatform.add("google_search_ad");
    if (platform === "microsoft") outputsByPlatform.add("microsoft_ad");
    if (platform === "reddit") outputsByPlatform.add("reddit_ad");
    if (platform === "youtube") outputsByPlatform.add("youtube_short_script");
    if (platform === "tiktok") outputsByPlatform.add("tiktok_caption");
    if (platform === "facebook") outputsByPlatform.add("facebook_post");
    if (platform === "instagram") outputsByPlatform.add("instagram_post");
  }
  await insertDraftOutputs(workspaceId, brandId, campaignId, prompt, [...outputsByPlatform]);

  const landingResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.content_studio_outputs
    where tenant_id = $1 and campaign_id = $2 and output_type = 'landing_page'
    order by created_at asc
    limit 1
    `,
    [workspaceId, campaignId]
  );
  const landingPageOutputId = landingResult?.rows[0]?.id ?? null;

  const experimentResult = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_ad_experiments (
      tenant_id, brand_id, campaign_id, experiment_name, objective, platforms, budget_mode, budget_cents,
      status, landing_page_output_id, launch_checklist_json, metadata_json
    )
    values ($1, $2, $3, $4, 'book_more_work', $5, 'manual_export', $6, 'needs_review', $7, $8::jsonb, $9::jsonb)
    returning id
    `,
    [
      workspaceId,
      brandId,
      campaignId,
      `${campaignName} launch kit`,
      parsed.data.platforms,
      Math.round(parsed.data.budgetDollars * 100),
      landingPageOutputId,
      JSON.stringify([
        "Confirm offer, pricing, service area, and claims.",
        "Approve landing/sales page before traffic goes live.",
        "Connect customer-owned ad accounts or export manually.",
        "Review platform playbook rules before uploading creative.",
        "Set daily budget and stop-loss rule before spend.",
        "Track source, campaign, lead, job, invoice, and revenue."
      ]),
      JSON.stringify({
        createdBy: "ad_launch_kit",
        reviewBeforeSpend: true,
        customerOwnedAccountsDefault: true,
        ferocityManagedAdvertising: "premium_managed_path",
        platformPlaybooksUsed: parsed.data.platforms.map((platform) => ({
          platform,
          playbookKey: playbookKeyForPlatform(platform),
          sourceUrls: playbooksByKey.get(playbookKeyForPlatform(platform))?.source_urls_json ?? []
        }))
      })
    ]
  );
  const experimentId = experimentResult?.rows[0]?.id;
  if (!experimentId) return;

  const angles = [
    ["Problem/Solution", `Tired of ${parsed.data.serviceLabel || "the same problem"}?`],
    ["Proof", "See what real customers are getting done."],
    ["Speed", "Need this handled soon? Start here."],
    ["Offer", parsed.data.offerLabel || "Get a clear quote before you decide."],
    ["Local Trust", "Local help, clear next step, no guessing."],
    ["Comparison", "Stop chasing callbacks and start with a cleaner process."],
    ["Urgency", "Open slots will not stay open forever."],
    ["Authority", "Real work, real proof, simple next step."],
    ["Objection", "Not sure what it costs? Ask first."],
    ["Referral", "Know someone who needs this? Send them here."]
  ].slice(0, parsed.data.variantCount);

  for (const [index, [angle, hook]] of angles.entries()) {
    const platform = parsed.data.platforms[index % parsed.data.platforms.length];
    const format = formatForPlatform(platform, index);
    const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
    const platformHook = hookForPlatform(platform, angle, hook, parsed.data.serviceLabel, parsed.data.offerLabel);
    await queryPostgres(
      `
      insert into public.marketing_creative_variants (
        tenant_id, brand_id, campaign_id, experiment_id, platform, format, hook, angle, audience, cta, status, predicted_score, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'needs_review', $11, $12::jsonb)
      `,
      [
        workspaceId,
        brandId,
        campaignId,
        experimentId,
        platform,
        format,
        platformHook,
        angle,
        parsed.data.audience || null,
        parsed.data.offerLabel || "Request a quote",
        Math.max(50, 84 - index * 3),
        JSON.stringify({
          createdBy: "ad_launch_kit",
          noProviderSubmitted: true,
          platformPlaybook: playbook ? {
            key: playbook.platform_key,
            summary: playbook.strategy_summary,
            rules: playbook.creative_rules_json,
            assetRequirements: playbook.asset_requirements_json,
            testingRules: playbook.testing_rules_json,
            avoid: playbook.avoid_json,
            sourceUrls: playbook.source_urls_json
          } : null
        })
      ]
    );
  }

  await queryPostgres(
    `
    update public.marketing_ad_experiments
    set creative_count = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, experimentId, angles.length]
  );

  await queryPostgres(
    `
    insert into public.marketing_memory_items (
      tenant_id, brand_id, memory_type, title, summary, source_table, source_id, performance_json, score, status, metadata_json
    )
    values ($1, $2, 'campaign', $3, $4, 'marketing_ad_experiments', $5, $6::jsonb, 55, 'needs_more_data', $7::jsonb)
    `,
    [
      workspaceId,
      brandId,
      `Launch kit: ${campaignName}`,
      "Track which platform, hook, offer, audience, and landing page turns attention into leads and booked work.",
      experimentId,
      JSON.stringify({ budgetCents: Math.round(parsed.data.budgetDollars * 100), platforms: parsed.data.platforms }),
      JSON.stringify({ createdBy: "ad_launch_kit", campaignId })
    ]
  );

  revalidateMarketingOs();
}

export async function createAdAutopilotPackageAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = adAutopilotPackageSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    businessThought: formData.get("businessThought"),
    sourceUrl: formData.get("sourceUrl")?.toString() || "",
    serviceLabel: formData.get("serviceLabel")?.toString() || undefined,
    offerLabel: formData.get("offerLabel")?.toString() || undefined,
    audience: formData.get("audience")?.toString() || undefined,
    sourceAssets: formData.get("sourceAssets")?.toString() || undefined,
    platforms: formData.getAll("platforms").map(String),
    publishMode: formData.get("publishMode") || "approval_required",
    budgetDollars: formData.get("budgetDollars") || "0",
    durationSeconds: formData.get("durationSeconds") || "15"
  });
  if (!parsed.success) return;
  if (!(await customPlatformsBelongToWorkspace(workspaceId, parsed.data.platforms))) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const campaignName = titleFromPrompt(parsed.data.businessThought);
  const playbookKeys = [...new Set(parsed.data.platforms.map(playbookKeyForPlatform))];
  const playbookResult = await queryPostgres<MarketingPlatformPlaybook>(
    `
    select platform_key, display_name, strategy_summary, creative_rules_json, asset_requirements_json,
      testing_rules_json, avoid_json, source_urls_json
    from public.marketing_platform_playbooks
    where platform_key = any($1::text[]) and status = 'active'
    order by display_name asc
    `,
    [playbookKeys]
  );
  const playbooksByKey = new Map((playbookResult?.rows ?? []).map((playbook) => [playbook.platform_key, playbook]));
  const playbookSummaryLines = parsed.data.platforms
    .map((platform) => {
      const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
      return playbook ? `${platformLabel(platform)}: ${playbook.strategy_summary}` : `${platformLabel(platform)}: create native, proof-led creative and review before launch.`;
    })
    .join("\n");
  const fallbackStrategy = fallbackFunnelStrategy(parsed.data);
  const generatedFunnelStrategy = await generateJsonWithAiService<Record<string, unknown>>({
    tenantId: workspaceId,
    brandId,
    userId: session?.userId ?? null,
    featureKey: "ai_generation",
    runType: "growth_funnel_strategy",
    aiCategory: "core",
    temperature: 0.35,
    system: [
      "You are Ferocity's growth funnel strategist.",
      "Return only a compact JSON object matching the requested fields.",
      "Create a practical audit, quiz, or offer funnel that a normal business owner can understand.",
      "Keep the short-video idea under the requested duration.",
      "Do not guarantee revenue, invent reviews, invent credentials, invent customer proof, or imply live publishing/ad spend is active.",
      "Every live customer send, public post, rendered video, or ad spend must stay behind approval and connected provider accounts."
    ].join(" "),
    user: JSON.stringify({
      ownerRequest: parsed.data.businessThought,
      serviceOrFunnelType: parsed.data.serviceLabel ?? null,
      offer: parsed.data.offerLabel ?? null,
      audience: parsed.data.audience ?? null,
      sourceUrl: parsed.data.sourceUrl || null,
      approvedOrSourceAssets: parsed.data.sourceAssets ?? null,
      platforms: parsed.data.platforms.map(platformLabel),
      publishMode: parsed.data.publishMode,
      budgetDollars: parsed.data.budgetDollars,
      durationSeconds: parsed.data.durationSeconds,
      platformPlaybooks: parsed.data.platforms.map((platform) => {
        const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
        return {
          platform,
          label: platformLabel(platform),
          strategySummary: playbook?.strategy_summary ?? null,
          creativeRules: playbook?.creative_rules_json ?? [],
          avoid: playbook?.avoid_json ?? []
        };
      }),
      requiredJsonShape: {
        funnelName: "short name",
        positioning: "plain English positioning",
        headline: "landing page headline",
        shortDemoHook: "15-45 second video hook",
        qualificationQuestions: ["5-7 questions"],
        followUpPlan: ["3-5 steps"],
        trackingPlan: ["3-5 source-to-revenue tracking points"],
        creativeAngles: [{ angle: "Problem", hook: "message hook", cta: "call to action" }],
        safetyChecks: ["review and compliance checks"],
        recommendedNextAction: "one next action"
      }
    }),
    fallback: fallbackStrategy,
    metadata: {
      source: "ad_autopilot_package",
      platforms: parsed.data.platforms,
      publishMode: parsed.data.publishMode,
      durationSeconds: parsed.data.durationSeconds
    }
  });
  const funnelStrategy = normalizeFunnelStrategy(generatedFunnelStrategy, fallbackStrategy);
  const prompt = [
    `Owner request: ${parsed.data.businessThought}`,
    parsed.data.serviceLabel ? `Service/product: ${parsed.data.serviceLabel}` : null,
    parsed.data.offerLabel ? `Offer: ${parsed.data.offerLabel}` : null,
    parsed.data.audience ? `Audience: ${parsed.data.audience}` : null,
    parsed.data.sourceUrl ? `Source URL: ${parsed.data.sourceUrl}` : null,
    parsed.data.sourceAssets ? `Approved/source assets: ${parsed.data.sourceAssets}` : null,
    `Platforms: ${parsed.data.platforms.map(platformLabel).join(", ")}`,
    `Publish mode: ${parsed.data.publishMode.replaceAll("_", " ")}`,
    playbookSummaryLines,
    formatFunnelStrategyForPrompt(funnelStrategy),
    "Build a complete ad package: landing page, captions, search/social ad copy, image direction, UGC-style short video script, scene plan, tracking notes, and review checklist. Do not publish or spend unless the publish mode and connected provider allow it."
  ].filter(Boolean).join("\n");

  const campaignResult = await queryPostgres<{ id: string }>(
    `
    insert into public.content_studio_campaigns (
      tenant_id, brand_id, campaign_key, prompt, campaign_name, goal, status, mode, approval_required, metadata_json, created_by_user_id
    )
    values ($1, $2, 'ad_autopilot_package', $3, $4, $5, 'needs_review', 'guided', true, $6::jsonb, $7)
    returning id
    `,
    [
      workspaceId,
      brandId,
      prompt,
      `${campaignName} ad autopilot package`,
      parsed.data.businessThought,
      JSON.stringify({
        source: "ad_autopilot_package",
        publishMode: parsed.data.publishMode,
        sourceUrl: parsed.data.sourceUrl || null,
        serviceLabel: parsed.data.serviceLabel ?? null,
        offerLabel: parsed.data.offerLabel ?? null,
        audience: parsed.data.audience ?? null,
        platforms: parsed.data.platforms,
        budgetCents: Math.round(parsed.data.budgetDollars * 100),
        aiAssisted: true,
        aiStrategyRunType: "growth_funnel_strategy",
        funnelStrategy,
        liveProviderSubmission: false,
        providerConnectionNeededForAutoPost: parsed.data.publishMode === "auto_when_connected",
        platformPlaybooks: Object.fromEntries(
          parsed.data.platforms.map((platform) => {
            const playbook = playbooksByKey.get(playbookKeyForPlatform(platform));
            return [platform, playbook ? {
              displayName: playbook.display_name,
              strategySummary: playbook.strategy_summary,
              creativeRules: playbook.creative_rules_json,
              assetRequirements: playbook.asset_requirements_json,
              testingRules: playbook.testing_rules_json,
              avoid: playbook.avoid_json,
              sourceUrls: playbook.source_urls_json
            } : null];
          })
        )
      }),
      session?.userId ?? null
    ]
  );
  const campaignId = campaignResult?.rows[0]?.id;
  if (!campaignId) return;

  const outputTypes = new Set<string>([
    "landing_page",
    "image_ad",
    "short_video_script",
    "ad_copy",
    "email_campaign",
    "gbp_post"
  ]);
  for (const platform of parsed.data.platforms) {
    if (platform === "google") outputTypes.add("google_search_ad");
    if (platform === "microsoft") outputTypes.add("microsoft_ad");
    if (platform === "reddit") outputTypes.add("reddit_ad");
    if (platform === "youtube") outputTypes.add("youtube_short_script");
    if (platform === "tiktok") outputTypes.add("tiktok_caption");
    if (platform === "facebook") outputTypes.add("facebook_post");
    if (platform === "instagram") outputTypes.add("instagram_post");
  }
  await insertDraftOutputs(workspaceId, brandId, campaignId, prompt, [...outputTypes]);

  const landingResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.content_studio_outputs
    where tenant_id = $1 and campaign_id = $2 and output_type = 'landing_page'
    order by created_at asc
    limit 1
    `,
    [workspaceId, campaignId]
  );

  const experimentResult = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_ad_experiments (
      tenant_id, brand_id, campaign_id, experiment_name, objective, platforms, budget_mode, budget_cents,
      status, landing_page_output_id, launch_checklist_json, metadata_json
    )
    values ($1, $2, $3, $4, 'book_more_work', $5, 'manual_export', $6, 'needs_review', $7, $8::jsonb, $9::jsonb)
    returning id
    `,
    [
      workspaceId,
      brandId,
      campaignId,
      `${campaignName} ad autopilot`,
      parsed.data.platforms,
      Math.round(parsed.data.budgetDollars * 100),
      landingResult?.rows[0]?.id ?? null,
      JSON.stringify([
        "Confirm business facts, offer, service area, pricing, proof, and claims.",
        "Approve video script and any customer proof before rendering or posting.",
        "Confirm budget cap, stop-loss rule, and destination page.",
        "Connect provider accounts before auto-posting or live spend.",
        "Track source, lead, job, invoice, payment, and revenue."
      ]),
      JSON.stringify({
        createdBy: "ad_autopilot_package",
        publishMode: parsed.data.publishMode,
        aiAssisted: true,
        funnelStrategy,
        liveSpendEnabled: false,
        autoPostRequested: parsed.data.publishMode === "auto_when_connected",
        providerConnectionNeeded: true
      })
    ]
  );
  const experimentId = experimentResult?.rows[0]?.id ?? null;

  const aiVariantAngles = funnelStrategy.creativeAngles
    .filter((item) => item.angle && item.hook)
    .slice(0, 7)
    .map((item) => [item.angle, item.hook, item.cta || parsed.data.offerLabel || "Request a quote"] as const);
  const variantAngles = aiVariantAngles.length > 0 ? aiVariantAngles : [
    ["Problem", parsed.data.businessThought],
    ["Proof", parsed.data.sourceAssets ? "Use real proof from approved assets." : "Ask for customer proof before publishing."],
    ["Offer", parsed.data.offerLabel || "Make the next step obvious."],
    ["Local Trust", parsed.data.serviceLabel ? `Show why ${parsed.data.serviceLabel} should feel safe to buy.` : "Show why the business is trustworthy."],
    ["Urgency", "Give people a reason to act now without fake scarcity."]
  ];
  if (experimentId) {
    for (const [index, [angle, hook, cta]] of variantAngles.entries()) {
      const platform = parsed.data.platforms[index % parsed.data.platforms.length];
      await queryPostgres(
        `
        insert into public.marketing_creative_variants (
          tenant_id, brand_id, campaign_id, experiment_id, platform, format, hook, angle, audience, cta, status, predicted_score, metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'needs_review', $11, $12::jsonb)
        `,
        [
          workspaceId,
          brandId,
          campaignId,
          experimentId,
          platform,
          formatForPlatform(platform, index),
          hookForPlatform(platform, angle, hook, parsed.data.serviceLabel, parsed.data.offerLabel),
          angle,
          parsed.data.audience || null,
          cta || parsed.data.offerLabel || "Request a quote",
          Math.max(58, 88 - index * 5),
          JSON.stringify({ createdBy: "ad_autopilot_package", publishMode: parsed.data.publishMode, aiAssisted: true, noProviderSubmitted: true })
        ]
      );
    }
    await queryPostgres(
      `
      update public.marketing_ad_experiments
      set creative_count = $3, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, experimentId, variantAngles.length]
    );
  }

  const videoPlatform = videoPlatformFromAdPlatforms(parsed.data.platforms);
  const scenes = [
    { scene: 1, seconds: "0-3", goal: "Stop the scroll with the core customer problem.", visual: "Owner clip, job footage, strong proof image, or clear text overlay.", textOverlay: funnelStrategy.shortDemoHook || parsed.data.businessThought },
    { scene: 2, seconds: "3-8", goal: "Show the service, product, or transformation.", visual: parsed.data.sourceAssets || "Use approved proof, photos, testimonials, or product shots.", textOverlay: funnelStrategy.headline || parsed.data.serviceLabel || "See what we handle" },
    { scene: 3, seconds: "8-12", goal: "Build trust with proof, process, review, or guarantee language that has been verified.", visual: "Review screenshot, before/after, office/team clip, or jobsite proof.", textOverlay: "Real proof. Clear next step." },
    { scene: 4, seconds: `12-${parsed.data.durationSeconds}`, goal: "Close with CTA, offer, phone/URL, and tracking source.", visual: "Logo, offer, service area, button/URL.", textOverlay: funnelStrategy.recommendedNextAction || parsed.data.offerLabel || "Get started today" }
  ];
  const videoResult = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_video_jobs (
      tenant_id, brand_id, provider_key, service_label, goal, offer_label, status,
      script_text, scenes_json, voiceover_text, cta_text, provider_request_json, history_json, metadata_json
    )
    values ($1, $2, 'provider_not_selected', $3, $4, $5, 'needs_review', $6, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
    returning id
    `,
    [
      workspaceId,
      brandId,
      parsed.data.serviceLabel || null,
      parsed.data.businessThought,
      parsed.data.offerLabel || null,
      [
        `Hook: ${parsed.data.businessThought}`,
        `AI funnel headline: ${funnelStrategy.headline}`,
        `Short demo hook: ${funnelStrategy.shortDemoHook}`,
        parsed.data.serviceLabel ? `Show: ${parsed.data.serviceLabel}` : "Show the main service or product.",
        parsed.data.sourceAssets ? `Use these approved/source assets: ${parsed.data.sourceAssets}` : "Request real photos, clips, reviews, or proof before final rendering.",
        parsed.data.offerLabel ? `Offer: ${parsed.data.offerLabel}` : "Close with a clear next step.",
        "Keep claims truthful. Do not invent results, reviews, credentials, or pricing."
      ].join("\n"),
      JSON.stringify(scenes),
      `Voiceover draft: ${funnelStrategy.shortDemoHook || parsed.data.businessThought}. ${funnelStrategy.positioning} ${parsed.data.offerLabel ? `${parsed.data.offerLabel}. ` : ""}Tap, call, or request a quote to get started.`,
      parsed.data.offerLabel || "Request a quote",
      JSON.stringify({
        providerReady: false,
        platform: videoPlatform,
        durationSeconds: parsed.data.durationSeconds,
        aspectRatios: videoPlatform === "youtube" ? ["16:9", "9:16"] : ["9:16", "1:1", "4:5"],
        exportFormats: ["script", "scene_plan", "voiceover", "caption", "provider_brief"],
        sourceAssets: parsed.data.sourceAssets ?? null,
        supportedProviders: ["manual_editor", "quickframe_style_brief", "runway", "pika", "kling", "veo", "openai"]
      }),
      JSON.stringify([{ status: "queued_for_review", at: new Date().toISOString(), note: "Ad Autopilot created a video brief and queued it for review. No provider submission happened." }]),
      JSON.stringify({
        campaignId,
        experimentId,
        publishMode: parsed.data.publishMode,
        aiAssisted: true,
        funnelStrategy,
        approvalRequired: true,
        noProviderSubmitted: true,
        creditRequiredForRendering: true,
        addOnRecommended: true,
        platform: videoPlatform,
        platforms: parsed.data.platforms,
        durationSeconds: parsed.data.durationSeconds,
        audience: parsed.data.audience ?? null,
        variantPrompts: variantAngles.map(([angle, hook, cta], index) => ({ variant: index + 1, hookAngle: angle, instruction: hook, cta }))
      })
    ]
  );
  const videoJobId = videoResult?.rows[0]?.id ?? null;

  if (brandId && videoJobId) {
    await queryPostgres(
      `
      insert into public.review_first_export_queue (
        tenant_id, brand_id, export_type, provider_key, target_label, title, body, status, risk_level, source_table, source_id, metadata_json
      )
      values ($1, $2, 'ad_autopilot_package', 'manual_export', $3, $4, $5, 'needs_review', 'medium', 'marketing_video_jobs', $6, $7::jsonb)
      `,
      [
        workspaceId,
        brandId,
        parsed.data.platforms.join(","),
        `Ad Autopilot package: ${campaignName}`,
        prompt,
        videoJobId,
        JSON.stringify({
          campaignId,
          experimentId,
          publishMode: parsed.data.publishMode,
          aiAssisted: true,
          funnelStrategy,
          autoPostRequiresProviderConnection: true,
          approvalRequired: true
        })
      ]
    );
  }

  if (brandId) {
    await queryPostgres(
      `
      insert into public.marketing_memory_items (
        tenant_id, brand_id, memory_type, title, summary, source_table, source_id, performance_json, score, status, metadata_json
      )
      values ($1, $2, 'campaign', $3, $4, 'content_studio_campaigns', $5, $6::jsonb, 62, 'learning', $7::jsonb)
      `,
      [
        workspaceId,
        brandId,
        `Ad Autopilot: ${campaignName}`,
        "Watch which creative angle, platform, proof, offer, and landing page creates real leads, jobs, payments, and reviews.",
        campaignId,
        JSON.stringify({ platforms: parsed.data.platforms, budgetCents: Math.round(parsed.data.budgetDollars * 100) }),
        JSON.stringify({ createdBy: "ad_autopilot_package", aiAssisted: true, videoJobId, experimentId, publishMode: parsed.data.publishMode, funnelStrategy })
      ]
    );
  }

  await activateFunnelOperations({
    tenantId: workspaceId,
    brandId,
    campaignId,
    funnelName: funnelStrategy.funnelName || `${campaignName} funnel`,
    serviceLabel: parsed.data.serviceLabel ?? null,
    qualificationQuestions: funnelStrategy.qualificationQuestions,
    followUpPlan: funnelStrategy.followUpPlan
  });

  revalidateMarketingOs();
}

export async function createOneClickCampaignAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = oneClickCampaignSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    campaignKey: formData.get("campaignKey")
  });
  if (!parsed.success) return;

  const blueprintResult = await queryPostgres<{
    campaign_key: string;
    label: string;
    plain_goal: string;
    prompt_starter: string;
    content_types: string[];
  }>(
    `
    select campaign_key, label, plain_goal, prompt_starter, content_types
    from public.marketing_os_campaign_blueprints
    where campaign_key = $1 and status = 'active'
    limit 1
    `,
    [parsed.data.campaignKey]
  );
  const blueprint = blueprintResult?.rows[0];
  if (!blueprint) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const campaignResult = await queryPostgres<{ id: string }>(
    `
    insert into public.content_studio_campaigns (tenant_id, brand_id, campaign_key, prompt, campaign_name, goal, status, mode, approval_required, metadata_json, created_by_user_id)
    values ($1, $2, $3, $4, $5, $6, 'needs_review', 'simple', true, $7::jsonb, $8)
    returning id
    `,
    [
      workspaceId,
      brandId,
      blueprint.campaign_key,
      blueprint.prompt_starter,
      blueprint.label,
      blueprint.plain_goal,
      JSON.stringify({ oneClick: true, noTokenSpend: true }),
      session?.userId ?? null
    ]
  );

  const campaignId = campaignResult?.rows[0]?.id;
  if (campaignId) {
    await insertDraftOutputs(workspaceId, brandId, campaignId, blueprint.prompt_starter, blueprint.content_types);
  }

  revalidateMarketingOs();
}

export async function createGraphicJobAction(formData: FormData) {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = graphicJobSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    jobType: formData.get("jobType"),
    serviceLabel: formData.get("serviceLabel")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const targetFormats =
    parsed.data.jobType === "review_graphic"
      ? ["facebook", "instagram", "story"]
      : parsed.data.jobType === "before_after"
        ? ["side_by_side", "comparison_graphic", "social_media"]
        : ["facebook_ad", "instagram_ad", "display_ad"];

  await queryPostgres(
    `
    insert into public.marketing_graphic_jobs (tenant_id, brand_id, job_type, target_formats, service_label, service_area, status, prompt_json, metadata_json)
    values ($1, $2, $3, $4, $5, $6, 'draft', $7::jsonb, $8::jsonb)
    `,
    [
      workspaceId,
      brandId,
      parsed.data.jobType,
      targetFormats,
      parsed.data.serviceLabel || null,
      parsed.data.serviceArea || null,
      JSON.stringify({ useBusinessProfile: true, useApprovedBranding: true }),
      JSON.stringify({ noProviderSubmitted: true, approvalRequired: true })
    ]
  );

  revalidateMarketingOs();
}

export async function createVideoJobAction(formData: FormData) {
  await requirePermission("ai:queue");
  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const parsed = videoJobSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    serviceLabel: formData.get("serviceLabel")?.toString() || undefined,
    goal: formData.get("goal"),
    offerLabel: formData.get("offerLabel")?.toString() || undefined,
    platform: formData.get("platform") || "multi_platform",
    durationSeconds: formData.get("durationSeconds") || "15",
    audience: formData.get("audience")?.toString() || undefined,
    sourceAssets: formData.get("sourceAssets")?.toString() || undefined,
    variantCount: formData.get("variantCount") || "3"
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  const videoPlan = await directVideoMarketingAsset({
    tenantId: workspaceId,
    brandId,
    userId: session?.userId ?? null,
    goal: parsed.data.goal,
    serviceLabel: parsed.data.serviceLabel,
    offerLabel: parsed.data.offerLabel,
    platform: parsed.data.platform,
    durationSeconds: parsed.data.durationSeconds,
    audience: parsed.data.audience,
    sourceAssets: parsed.data.sourceAssets,
    variantCount: parsed.data.variantCount
  });
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_video_jobs (
      tenant_id, brand_id, provider_key, service_label, goal, offer_label, status,
      script_text, scenes_json, voiceover_text, cta_text, provider_request_json, history_json, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb)
    returning id
    `,
    [
      workspaceId,
      brandId,
      videoPlan.providerKey,
      parsed.data.serviceLabel || null,
      parsed.data.goal,
      parsed.data.offerLabel || null,
      videoPlan.status,
      videoPlan.script,
      JSON.stringify(videoPlan.scenes),
      videoPlan.voiceover,
      videoPlan.cta,
      JSON.stringify(videoPlan.providerRequest),
      JSON.stringify(videoPlan.history),
      JSON.stringify(videoPlan.metadata)
    ]
  );
  const videoJobId = result?.rows[0]?.id;
  if (videoJobId && brandId) {
    await queryPostgres(
      `
      insert into public.review_first_export_queue (
        tenant_id, brand_id, export_type, provider_key, target_label, title, body, status, risk_level, source_table, source_id, metadata_json
      )
      values ($1, $2, 'video_brief', 'manual_export', $3, $4, $5, 'needs_review', 'medium', 'marketing_video_jobs', $6, $7::jsonb)
      `,
      [
        workspaceId,
        brandId,
        parsed.data.platform,
        `Video ad brief: ${parsed.data.goal}`,
        videoPlan.script,
        videoJobId,
        JSON.stringify({ source: "video_ad_studio", providerRequest: videoPlan.providerRequest, variantPrompts: videoPlan.variantPrompts })
      ]
    );
  }

  revalidateMarketingOs();
}

function revalidateMarketingOs() {
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/marketing");
  revalidatePath("/app/controls");
  revalidatePath("/app/billing");
  revalidatePath("/app/ai-workforce");
  revalidatePath("/app/operator");
}
