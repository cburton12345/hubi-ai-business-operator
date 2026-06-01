"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const brandSchema = z.object({
  brandId: z.string().uuid().optional()
});

const websiteImportSchema = z.object({
  brandId: z.string().uuid().optional(),
  websiteUrl: z.string().url().max(500)
});

const contentCampaignSchema = z.object({
  brandId: z.string().uuid().optional(),
  prompt: z.string().trim().min(4).max(1000),
  campaignName: z.string().trim().min(2).max(160).optional()
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
  offerLabel: z.string().trim().max(160).optional()
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
  if (outputType === "email_campaign") return "email";
  if (outputType === "sms_campaign") return "sms";
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
  if (outputType === "gbp_post") return "gbp_post";
  if (outputType.includes("review")) return "review_reply";
  if (outputType.includes("ad") || outputType.includes("facebook") || outputType.includes("instagram")) return "ad_creative";
  if (outputType === "landing_page" || outputType.includes("seo") || outputType === "blog_article") return "website_page";
  if (outputType === "email_campaign") return "email_campaign";
  if (outputType === "sms_campaign") return "sms_campaign";
  return "other";
}

function providerFor(outputType: string) {
  if (outputType === "gbp_post" || outputType.includes("review")) return "google_business_profile";
  if (outputType.includes("facebook") || outputType.includes("instagram") || outputType.includes("ad")) return "meta";
  if (outputType === "landing_page" || outputType === "blog_article") return "website_connector";
  if (outputType === "email_campaign") return "email_provider";
  if (outputType === "sms_campaign") return "twilio";
  return "manual_export";
}

function platformFor(outputType: string) {
  if (outputType.includes("facebook")) return "facebook";
  if (outputType.includes("instagram")) return "instagram";
  if (outputType.includes("linkedin")) return "linkedin";
  if (outputType === "x_post") return "x";
  if (outputType.includes("tiktok")) return "tiktok";
  if (outputType.includes("gbp")) return "google_business_profile";
  if (outputType.includes("email")) return "email";
  if (outputType.includes("sms")) return "sms";
  if (outputType.includes("landing")) return "website";
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
      'ferocity',
      'ready',
      now(),
      jsonb_build_object('refreshedFrom', 'brands_services_locations_proof')
    from public.brands b
    left join public.brand_marketing_settings ms on ms.tenant_id = b.tenant_id and ms.brand_id = b.id
    where b.tenant_id = $1 and b.id = $2
    on conflict do nothing
    `,
    [workspaceId, brandId]
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
      JSON.stringify({ noLiveScrapeYet: true, reviewBeforeUse: true })
    ]
  );

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
      "ad_copy"
    ]);
  }

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
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = videoJobSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || undefined,
    serviceLabel: formData.get("serviceLabel")?.toString() || undefined,
    goal: formData.get("goal"),
    offerLabel: formData.get("offerLabel")?.toString() || undefined
  });
  if (!parsed.success) return;

  const brandId = await firstBrandId(workspaceId, parsed.data.brandId);
  await queryPostgres(
    `
    insert into public.marketing_video_jobs (
      tenant_id, brand_id, provider_key, service_label, goal, offer_label, status,
      script_text, scenes_json, voiceover_text, cta_text, provider_request_json, history_json, metadata_json
    )
    values ($1, $2, 'provider_not_selected', $3, $4, $5, 'draft', $6, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
    `,
    [
      workspaceId,
      brandId,
      parsed.data.serviceLabel || null,
      parsed.data.goal,
      parsed.data.offerLabel || null,
      `Draft script for ${parsed.data.goal}. Review claims, offer, service area, and brand facts before provider submission.`,
      JSON.stringify([
        { scene: 1, goal: "Show the customer problem" },
        { scene: 2, goal: "Show the service and proof" },
        { scene: 3, goal: "End with a clear call to action" }
      ]),
      `Voiceover draft for ${parsed.data.goal}.`,
      "Request a quote",
      JSON.stringify({ providerReady: false, supportedFutureProviders: ["openai", "runway", "kling", "pika", "future_provider"] }),
      JSON.stringify([{ status: "draft", at: new Date().toISOString(), note: "Video job prepared without provider submission." }]),
      JSON.stringify({ approvalRequired: true, noProviderSubmitted: true })
    ]
  );

  revalidateMarketingOs();
}

function revalidateMarketingOs() {
  revalidatePath("/app/marketing-os");
  revalidatePath("/app/marketing");
  revalidatePath("/app/controls");
  revalidatePath("/app/billing");
}
