import { getWeeklyPeriodKey, type BrandPromptContext } from "@/lib/ai/prompt-context";
import { generateJsonWithProvider } from "@/lib/ai/model-provider";
import { queryPostgres } from "@/lib/db/postgres";
import type { RiskLevel } from "@/types/core";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

type BrandContextRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  account_type: string;
  plan_key: string | null;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  domain: string | null;
  phone: string | null;
  email: string | null;
  business_model: BrandPromptContext["brand"]["businessModel"];
  industry: string | null;
  vertical: string | null;
  description: string | null;
  primary_goal: string | null;
  primary_location: string | null;
  risk_profile: BrandPromptContext["brand"]["riskProfile"];
  services: { name: string; slug: string; description: string | null; priority: number }[];
  locations: { city: string | null; state: string | null; service_area_name: string | null; priority: number }[];
  offers: { title: string; description: string | null }[];
  landing_pages: {
    title: string;
    slug: string;
    url: string | null;
    page_type: "landing_page" | "city_page" | "service_page" | "homepage" | "other";
    primary_keyword: string | null;
    status: "planned" | "draft" | "published" | "archived";
  }[];
  seo_keywords: {
    keyword: string;
    intent: "service" | "local" | "comparison" | "education" | "brand" | "commercial";
    priority: number;
    target_url: string | null;
  }[];
  target_customers: string | null;
  cta_goals: string | null;
  ad_goals: string | null;
  seo_targets: string | null;
  review_strategy: string | null;
  follow_up_strategy: string | null;
  tone_of_voice: string | null;
  approval_mode: BrandPromptContext["marketing"]["approvalMode"];
  auto_create_low_risk_drafts: boolean;
  auto_weekly_seo_posts: boolean;
  auto_gbp_post_drafts: boolean;
  auto_facebook_post_drafts: boolean;
  auto_review_request_drafts: boolean;
  auto_follow_up_drafts: boolean;
  auto_landing_page_suggestions: boolean;
  high_risk_approval_rules: Record<string, boolean>;
};

type PlanItem = {
  key: string;
  kind: "seo_blog" | "facebook_post" | "gbp_post" | "landing_page" | "google_ad" | "review_request" | "lead_followup" | "recommendation";
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  scheduledOffsetDays: number;
  draft?: {
    contentType: "blog" | "facebook_post" | "gbp_post" | "landing_page" | "google_ad" | "email" | "sms";
    body: string;
  };
  recommendation?: {
    category: "seo" | "ads" | "content" | "lead_management" | "operations";
    rationale: string;
    suggestedAction: string;
    impact: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
  };
};

export type GenerateWeeklyMarketingPlansResult = {
  ok: boolean;
  periodKey: string;
  brandsProcessed: number;
  plansCreated: number;
  draftsCreated: number;
  recommendationsCreated: number;
  calendarItemsCreated: number;
  message: string;
};

function listLine(values: string[], fallback: string) {
  return values.length > 0 ? values.join(", ") : fallback;
}

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function firstService(row: BrandContextRow) {
  return row.services[0]?.name ?? row.industry ?? row.vertical ?? "core service";
}

function firstLocation(row: BrandContextRow) {
  const location = row.locations[0];
  return location?.service_area_name ?? ([location?.city, location?.state].filter(Boolean).join(", ") || row.primary_location || "your service area");
}

function cta(row: BrandContextRow) {
  return row.cta_goals ?? ([row.phone, row.email].filter(Boolean).join(" or ") || "request a quote");
}

function contactLine(row: BrandContextRow) {
  const contact = [row.phone, row.email].filter(Boolean).join(" or ");
  return contact ? `Contact ${row.brand_name} at ${contact}.` : `Contact ${row.brand_name} to ${cta(row)}.`;
}

function brandContextSummary(row: BrandContextRow) {
  const services = listLine(row.services.map((service) => service.name).slice(0, 6), firstService(row));
  const areas = listLine(
    row.locations
      .map((location) => location.service_area_name ?? [location.city, location.state].filter(Boolean).join(", "))
      .filter(Boolean)
      .slice(0, 6),
    firstLocation(row)
  );
  const keywords = listLine(row.seo_keywords.map((keyword) => keyword.keyword).slice(0, 6), row.seo_targets ?? "brand service keywords");

  return { services, areas, keywords, audience: row.target_customers ?? "qualified local customers" };
}

function safetyNote(row: BrandContextRow) {
  const legal = row.risk_profile === "legal_sensitive" ? " Keep this educational and avoid legal advice or outcome claims." : "";
  return `Use only the brand facts above. Do not invent guarantees, reviews, licensing, pricing, or results.${legal}`;
}

function planItems(row: BrandContextRow): PlanItem[] {
  const context = brandContextSummary(row);
  const service = firstService(row);
  const area = firstLocation(row);
  const offer = row.offers[0]?.title;
  const keyword = row.seo_keywords[0]?.keyword ?? `${service} ${area}`;
  const tone = row.tone_of_voice ?? "clear, useful, and professional";
  const callToAction = cta(row);
  const contact = contactLine(row);
  const guardrail = safetyNote(row);
  const landingSlug = cleanSlug(`${service}-${area}`);
  const normalRisk: RiskLevel = row.risk_profile === "normal" ? "low" : "high";

  return [
    {
      key: "seo-blog-1",
      kind: "seo_blog",
      title: `${service}: what customers in ${area} should know`,
      summary: `Helpful SEO article using ${keyword}.`,
      riskLevel: normalRisk,
      scheduledOffsetDays: 1,
      draft: {
        contentType: "blog",
        body: [
          `# ${service}: what customers in ${area} should know`,
          "",
          `${row.brand_name} helps ${context.audience} with ${context.services} across ${context.areas}. This draft is written in a ${tone} voice and focuses on practical questions customers ask before they reach out.`,
          "",
          `## When this service matters`,
          `Customers usually start looking for ${service} when timing, reliability, or location fit becomes important. For ${area}, the most useful page should answer what the service includes, how to prepare, and what information helps the team respond quickly.`,
          "",
          `## What to ask before choosing a provider`,
          `Ask about service fit, availability, process, and next steps. Avoid assuming pricing, guarantees, or credentials unless those facts are listed in the brand profile.`,
          "",
          offer ? `## Current offer angle\n${offer} can be mentioned as a reviewable offer only if it is still active and accurate.` : "",
          `## Next step`,
          `${contact}`,
          "",
          guardrail
        ]
          .filter(Boolean)
          .join("\n")
      }
    },
    {
      key: "facebook-post-1",
      kind: "facebook_post",
      title: `${row.brand_name}: weekly service-area Facebook draft`,
      summary: `Short social post for ${service} in ${area}.`,
      riskLevel: "low",
      scheduledOffsetDays: 2,
      draft: {
        contentType: "facebook_post",
        body: [
          `${area}: if ${service.toLowerCase()} is on your list this week, ${row.brand_name} can help you sort out the next step.`,
          "",
          `Useful for: ${context.audience}.`,
          `Services: ${context.services}.`,
          offer ? `Offer to review before posting: ${offer}.` : "",
          `${contact}`,
          "",
          guardrail
        ]
          .filter(Boolean)
          .join("\n")
      }
    },
    {
      key: "gbp-post-1",
      kind: "gbp_post",
      title: `${row.brand_name}: Google Business Profile post draft`,
      summary: `GBP-friendly service update for ${area}.`,
      riskLevel: "low",
      scheduledOffsetDays: 3,
      draft: {
        contentType: "gbp_post",
        body: [
          `${row.brand_name} supports ${context.audience} looking for ${service} in ${area}.`,
          `This week's focus: make it easy for customers to ask about fit, availability, and next steps.`,
          `${contact}`,
          guardrail
        ].join("\n\n")
      }
    },
    {
      key: "landing-page-idea",
      kind: "landing_page",
      title: `${service} in ${area} landing page`,
      summary: `Suggested city/service page for ${keyword}.`,
      riskLevel: "medium",
      scheduledOffsetDays: 4,
      draft: row.auto_landing_page_suggestions
        ? {
            contentType: "landing_page",
            body: [
              `# ${service} in ${area}`,
              "",
              `URL slug suggestion: /${landingSlug}`,
              `Primary keyword: ${keyword}`,
              "",
              `## Page goal`,
              `Convert ${context.audience} who need ${service} in ${area}.`,
              "",
              `## Suggested sections`,
              `- Service overview using only confirmed brand details`,
              `- Who this helps`,
              `- Service areas`,
              `- How to request help`,
              `- FAQ without invented pricing, guarantees, or credentials`,
              "",
              `CTA: ${callToAction}`,
              guardrail
            ].join("\n")
          }
        : undefined,
      recommendation: {
        category: "seo",
        rationale: `The brand has service and location data that supports a focused landing page for ${keyword}.`,
        suggestedAction: `Draft and review a ${service} in ${area} landing page before publishing.`,
        impact: "medium",
        effort: "medium"
      }
    },
    {
      key: "ad-campaign-idea",
      kind: "google_ad",
      title: `${row.brand_name}: ${service} campaign concept`,
      summary: `Ad concept only. No budgets, API calls, or launches.`,
      riskLevel: "medium",
      scheduledOffsetDays: 5,
      draft: {
        contentType: "google_ad",
        body: [
          `Campaign concept: ${service} demand in ${area}`,
          "",
          "Headlines:",
          `${service} in ${area}`,
          `${row.brand_name} Service Help`,
          `Ask About ${service}`,
          "",
          "Descriptions:",
          `${row.brand_name} helps ${context.audience} explore ${service}. ${callToAction}.`,
          `Service-focused support for ${area}. Review details before launching any campaign.`,
          "",
          "Approval rule: budget changes and launch actions require admin approval.",
          guardrail
        ].join("\n")
      },
      recommendation: {
        category: "ads",
        rationale: `A campaign hypothesis can be reviewed without connecting Google Ads or changing budget.`,
        suggestedAction: `Review the campaign angle, landing page fit, copy, and risk notes before any external ad setup.`,
        impact: "medium",
        effort: "low"
      }
    },
    {
      key: "review-request",
      kind: "review_request",
      title: `${row.brand_name}: review request message draft`,
      summary: `Private review request draft. Nothing is sent automatically.`,
      riskLevel: "low",
      scheduledOffsetDays: 6,
      draft: {
        contentType: "email",
        body: [
          "Subject: Quick favor after working with us",
          "",
          `Hi [Customer Name],`,
          "",
          `Thank you for choosing ${row.brand_name}. If the experience was helpful, would you be open to leaving a quick review? Your feedback helps other customers understand what to expect.`,
          "",
          `Review link: [Add approved review link]`,
          "",
          `Thanks,`,
          `${row.brand_name}`,
          "",
          "Note: send manually only after confirming the customer relationship and review policy."
        ].join("\n")
      }
    },
    {
      key: "lead-followup",
      kind: "lead_followup",
      title: `${row.brand_name}: lead follow-up message draft`,
      summary: `Manual follow-up draft for stale or new leads.`,
      riskLevel: "low",
      scheduledOffsetDays: 7,
      draft: {
        contentType: "email",
        body: [
          "Subject: Following up on your request",
          "",
          "Hi [Lead Name],",
          "",
          `Thanks for reaching out to ${row.brand_name}. I wanted to follow up and see if you still need help with ${service} in ${area}.`,
          "",
          `The easiest next step is to reply with your timing, location, and any details we should know.`,
          "",
          `${contact}`,
          "",
          "Note: do not send automatically. Confirm consent and lead details first."
        ].join("\n")
      }
    },
    {
      key: "improvement-alert",
      kind: "recommendation",
      title: `${row.brand_name}: improve stale lead follow-up visibility`,
      summary: "Watch new and stale leads so operators can respond before opportunities go cold.",
      riskLevel: "low",
      scheduledOffsetDays: 0,
      recommendation: {
        category: "lead_management",
        rationale: "Lead follow-up quality affects conversion and does not require external integrations in this phase.",
        suggestedAction: "Review stale leads weekly, generate a reply draft, and assign manual follow-up.",
        impact: "medium",
        effort: "low"
      }
    }
  ];
}

function shouldCreateDraft(row: BrandContextRow, item: PlanItem) {
  if (!item.draft || !row.auto_create_low_risk_drafts) return false;
  if (item.kind === "seo_blog") return row.auto_weekly_seo_posts;
  if (item.kind === "gbp_post") return row.auto_gbp_post_drafts;
  if (item.kind === "facebook_post") return row.auto_facebook_post_drafts;
  if (item.kind === "review_request") return row.auto_review_request_drafts;
  if (item.kind === "lead_followup") return row.auto_follow_up_drafts;
  if (item.kind === "landing_page") return row.auto_landing_page_suggestions;
  return true;
}

function weekStartDate(periodKey: string) {
  const [yearText, weekText] = periodKey.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay();
  const isoMonday = new Date(simple);
  isoMonday.setUTCDate(simple.getUTCDate() - ((day + 6) % 7));
  return isoMonday;
}

function scheduledFor(periodKey: string, offsetDays: number) {
  const date = weekStartDate(periodKey);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  date.setUTCHours(16, 0, 0, 0);
  return date.toISOString();
}

function isPlanItem(value: unknown): value is PlanItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlanItem>;
  return Boolean(
    item.key &&
      item.kind &&
      item.title &&
      item.summary &&
      item.riskLevel &&
      typeof item.scheduledOffsetDays === "number" &&
      (item.draft || item.recommendation)
  );
}

async function generatePlanItems(row: BrandContextRow, periodKey: string): Promise<PlanItem[]> {
  const fallback = { items: planItems(row) };
  const context = brandContextSummary(row);
  const generated = await generateJsonWithProvider<{ items: PlanItem[] }>({
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    runType: "weekly_marketing_plan",
    fallback,
    system: [
      "You are an AI marketing operator for external business workspaces.",
      "Return JSON only with an items array matching the provided structure.",
      "Use the brand facts only. Avoid fake guarantees, fake pricing, invented reviews, unverified licensing, legal or medical claims, and misleading results.",
      "Do not publish, send messages, change budgets, or call external APIs."
    ].join(" "),
    user: JSON.stringify({
      periodKey,
      brand: {
        name: row.brand_name,
        businessType: row.business_model,
        industry: row.industry,
        services: row.services,
        serviceAreas: row.locations,
        targetCustomer: row.target_customers,
        tone: row.tone_of_voice,
        phone: row.phone,
        email: row.email,
        cta: row.cta_goals,
        offers: row.offers,
        landingPages: row.landing_pages,
        seoKeywords: row.seo_keywords,
        safety: safetyNote(row)
      },
      requiredMix: {
        seoOrSocialIdeas: 3,
        landingPageIdea: 1,
        adCampaignIdea: 1,
        followUpOrReviewRequestIdea: 1,
        improvementAlert: 1
      },
      fallbackItems: fallback.items,
      context
    })
  });

  return Array.isArray(generated.items) && generated.items.length >= 7 && generated.items.every(isPlanItem)
    ? generated.items
    : fallback.items;
}

async function loadBrandRows(tenantId: string) {
  const result = await queryPostgres<BrandContextRow>(
    `
    select
      t.id as tenant_id,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.account_type,
      t.plan_key,
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      b.domain,
      b.phone,
      b.email,
      b.business_model,
      b.industry,
      b.vertical,
      b.description,
      b.primary_goal,
      b.primary_location,
      b.risk_profile,
      coalesce(services.items, '[]'::jsonb) as services,
      coalesce(locations.items, '[]'::jsonb) as locations,
      coalesce(offers.items, '[]'::jsonb) as offers,
      coalesce(pages.items, '[]'::jsonb) as landing_pages,
      coalesce(keywords.items, '[]'::jsonb) as seo_keywords,
      s.target_customers,
      s.cta_goals,
      s.ad_goals,
      s.seo_targets,
      s.review_strategy,
      s.follow_up_strategy,
      s.tone_of_voice,
      coalesce(s.approval_mode, 'manual') as approval_mode,
      coalesce(s.auto_create_low_risk_drafts, true) as auto_create_low_risk_drafts,
      coalesce(s.auto_weekly_seo_posts, true) as auto_weekly_seo_posts,
      coalesce(s.auto_gbp_post_drafts, true) as auto_gbp_post_drafts,
      coalesce(s.auto_facebook_post_drafts, true) as auto_facebook_post_drafts,
      coalesce(s.auto_review_request_drafts, true) as auto_review_request_drafts,
      coalesce(s.auto_follow_up_drafts, true) as auto_follow_up_drafts,
      coalesce(s.auto_landing_page_suggestions, true) as auto_landing_page_suggestions,
      coalesce(s.high_risk_approval_rules, '{}'::jsonb) as high_risk_approval_rules
    from public.tenants t
    join public.brands b on b.tenant_id = t.id
    left join public.brand_marketing_settings s on s.brand_id = b.id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', name, 'slug', slug, 'description', description, 'priority', priority) order by priority desc, name) as items
      from public.brand_services
      where tenant_id = t.id and brand_id = b.id and active = true
    ) services on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('city', city, 'state', state, 'service_area_name', service_area_name, 'priority', priority) order by priority desc) as items
      from public.brand_locations
      where tenant_id = t.id and brand_id = b.id and active = true
    ) locations on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('title', title, 'description', description) order by created_at desc) as items
      from public.brand_offers
      where tenant_id = t.id and brand_id = b.id and active = true
    ) offers on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'url', url, 'page_type', page_type, 'primary_keyword', primary_keyword, 'status', status) order by title) as items
      from public.brand_landing_pages
      where tenant_id = t.id and brand_id = b.id and status <> 'archived'
    ) pages on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('keyword', keyword, 'intent', intent, 'priority', priority, 'target_url', target_url) order by priority desc, keyword) as items
      from public.brand_seo_keywords
      where tenant_id = t.id and brand_id = b.id
    ) keywords on true
    where t.id = $1 and b.status = 'active'
    order by b.name
    `,
    [tenantId]
  );

  return result?.rows ?? [];
}

export async function generateWeeklyMarketingPlans(tenantId = internalTenantId, date = new Date()): Promise<GenerateWeeklyMarketingPlansResult> {
  const periodKey = getWeeklyPeriodKey(date);
  const rows = await loadBrandRows(tenantId);
  let plansCreated = 0;
  let draftsCreated = 0;
  let recommendationsCreated = 0;
  let calendarItemsCreated = 0;

  for (const row of rows) {
    const items = await generatePlanItems(row, periodKey);
    const summary = `Weekly operator plan for ${row.brand_name}: ${items
      .map((item) => item.title)
      .slice(0, 4)
      .join("; ")}.`;
    const planResult = await queryPostgres<{ id: string }>(
      `
      insert into public.marketing_plans (tenant_id, brand_id, period_key, status, summary, plan_json, generated_by)
      values ($1, $2, $3, 'ready', $4, $5::jsonb, 'system')
      on conflict (brand_id, period_key)
      do update set summary = excluded.summary, plan_json = excluded.plan_json, status = 'ready', updated_at = now()
      returning id
      `,
      [
        row.tenant_id,
        row.brand_id,
        periodKey,
        summary,
        JSON.stringify({
          generator: "phase2_deterministic_marketing_operator",
          periodKey,
          brand: {
            id: row.brand_id,
            name: row.brand_name,
            businessType: row.business_model,
            services: row.services,
            serviceAreas: row.locations,
            targetCustomer: row.target_customers,
            tone: row.tone_of_voice,
            phone: row.phone,
            email: row.email,
            cta: row.cta_goals,
            offers: row.offers,
            landingPages: row.landing_pages,
            seoKeywords: row.seo_keywords
          },
          safety: {
            draftOnly: true,
            prohibitedActions: [
              "publishing live",
              "ad budget changes",
              "legal-sensitive claims",
              "pricing changes",
              "major homepage changes",
              "deleting pages",
              "public review responses",
              "automatic lead messages"
            ]
          },
          items
        })
      ]
    );
    const planId = planResult?.rows[0]?.id;
    if (!planId) continue;
    plansCreated += 1;

    await queryPostgres(
      `
      delete from public.marketing_calendar_items
      where tenant_id = $1
        and brand_id = $2
        and metadata_json->>'generator' = 'phase2_deterministic_marketing_operator'
        and metadata_json->>'periodKey' = $3
      `,
      [row.tenant_id, row.brand_id, periodKey]
    );
    await queryPostgres(
      `
      delete from public.ai_drafts
      where tenant_id = $1
        and brand_id = $2
        and metadata_json->>'generator' = 'phase2_deterministic_marketing_operator'
        and metadata_json->>'periodKey' = $3
      `,
      [row.tenant_id, row.brand_id, periodKey]
    );
    await queryPostgres(
      `
      delete from public.recommendations
      where tenant_id = $1
        and brand_id = $2
        and metadata_json->>'generator' = 'phase2_deterministic_marketing_operator'
        and metadata_json->>'periodKey' = $3
      `,
      [row.tenant_id, row.brand_id, periodKey]
    );

    for (const item of items) {
      let sourceType: "ai_draft" | "recommendation" | "marketing_plan" = "marketing_plan";
      let sourceId = planId;
      let status: "draft" | "upcoming" = item.draft ? "draft" : "upcoming";

      if (shouldCreateDraft(row, item) && item.draft) {
        const draftStatus = item.riskLevel === "low" ? "draft" : "needs_review";
        const draftResult = await queryPostgres<{ id: string }>(
          `
          insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level)
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          returning id
          `,
          [
            row.tenant_id,
            row.brand_id,
            item.draft.contentType,
            item.title,
            item.draft.body,
            JSON.stringify({
              generator: "phase2_deterministic_marketing_operator",
              periodKey,
              planId,
              planItemKey: item.key,
              safety: "draft_only_no_external_send_or_publish"
            }),
            draftStatus,
            item.riskLevel
          ]
        );
        const draftId = draftResult?.rows[0]?.id;
        if (draftId) {
          draftsCreated += 1;
          sourceType = "ai_draft";
          sourceId = draftId;

          if (item.riskLevel !== "low") {
            await queryPostgres(
              `
              insert into public.approvals (tenant_id, brand_id, target_type, target_id, status, risk_level, notes)
              values ($1, $2, 'ai_draft', $3, 'pending', $4, 'Phase 2 generated draft requires review before publishing.')
              `,
              [row.tenant_id, row.brand_id, draftId, item.riskLevel]
            );
          }
        }
      }

      if (item.recommendation) {
        const recommendationResult = await queryPostgres<{ id: string }>(
          `
          insert into public.recommendations (
            tenant_id,
            brand_id,
            category,
            title,
            summary,
            rationale,
            suggested_action,
            impact_estimate,
            effort_estimate,
            risk_level,
            status,
            created_by,
            metadata_json
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', 'system', $11::jsonb)
          returning id
          `,
          [
            row.tenant_id,
            row.brand_id,
            item.recommendation.category,
            item.title,
            item.summary,
            item.recommendation.rationale,
            item.recommendation.suggestedAction,
            item.recommendation.impact,
            item.recommendation.effort,
            item.riskLevel,
            JSON.stringify({
              generator: "phase2_deterministic_marketing_operator",
              periodKey,
              planId,
              planItemKey: item.key
            })
          ]
        );
        const recommendationId = recommendationResult?.rows[0]?.id;
        if (recommendationId) {
          recommendationsCreated += 1;
          if (sourceType === "marketing_plan") {
            sourceType = "recommendation";
            sourceId = recommendationId;
            status = "upcoming";
          }

          if (item.riskLevel !== "low") {
            await queryPostgres(
              `
              insert into public.approvals (tenant_id, brand_id, target_type, target_id, status, risk_level, notes)
              values ($1, $2, 'recommendation', $3, 'pending', $4, 'Phase 2 recommendation requires approval before action.')
              `,
              [row.tenant_id, row.brand_id, recommendationId, item.riskLevel]
            );
          }
        }
      }

      const calendarResult = await queryPostgres(
        `
        insert into public.marketing_calendar_items (
          tenant_id,
          brand_id,
          source_type,
          source_id,
          title,
          item_type,
          status,
          scheduled_for,
          risk_level,
          notes,
          metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        `,
        [
          row.tenant_id,
          row.brand_id,
          sourceType,
          sourceId,
          item.title,
          item.kind,
          status,
          scheduledFor(periodKey, item.scheduledOffsetDays),
          item.riskLevel,
          item.summary,
          JSON.stringify({ periodKey, planId, planItemKey: item.key, generator: "phase2_deterministic_marketing_operator" })
        ]
      );

      if ((calendarResult?.rowCount ?? 0) > 0) {
        calendarItemsCreated += 1;
      }
    }

    await queryPostgres(
      `
      insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
      values ($1, $2, 'system', 'phase2.weekly_marketing_plan_generated', 'marketing_plan', $3, $4::jsonb)
      `,
      [row.tenant_id, row.brand_id, planId, JSON.stringify({ periodKey, items: items.length })]
    );
  }

  return {
    ok: true,
    periodKey,
    brandsProcessed: rows.length,
    plansCreated,
    draftsCreated,
    recommendationsCreated,
    calendarItemsCreated,
    message: `Generated ${plansCreated} weekly marketing plans, ${draftsCreated} drafts, ${recommendationsCreated} recommendations, and ${calendarItemsCreated} calendar items.`
  };
}
