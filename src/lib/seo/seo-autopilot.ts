import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type SeoBrandRow = {
  tenant_id: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  business_model: string;
  industry: string | null;
  description: string | null;
  primary_goal: string | null;
  primary_location: string | null;
  risk_profile: string;
  target_customers: string | null;
  cta_goals: string | null;
  seo_targets: string | null;
  tone_of_voice: string | null;
  services: { name: string; description: string | null; priority: number }[];
  locations: { city: string | null; state: string | null; service_area_name: string | null; priority: number }[];
  landing_pages: { title: string; slug: string; page_type: string; primary_keyword: string | null; status: string }[];
  seo_keywords: { keyword: string; intent: string; priority: number; target_url: string | null }[];
};

export type SeoAutopilotSummary = {
  brandId: string;
  brandName: string;
  keywordCount: number;
  pageCount: number;
  recentDraftCount: number;
  topKeywords: string[];
  nextTopics: string[];
};

export type GenerateSeoAutopilotResult = {
  brandsProcessed: number;
  draftsCreated: number;
  recommendationsCreated: number;
  calendarItemsCreated: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function areaName(row: SeoBrandRow) {
  const location = row.locations[0];
  return location?.service_area_name ?? (compact([location?.city, location?.state]).join(", ") || row.primary_location || "your service area");
}

function serviceName(row: SeoBrandRow) {
  return row.services[0]?.name ?? row.industry ?? "core service";
}

function keywordSeeds(row: SeoBrandRow) {
  const explicit = row.seo_keywords.map((item) => item.keyword).slice(0, 8);
  const service = serviceName(row);
  const area = areaName(row);
  const generated = [
    `${service} ${area}`,
    `${service} near me`,
    `${area} ${service}`,
    `best ${service} questions`,
    `${service} cost questions`,
    `${service} company ${area}`
  ];

  return Array.from(new Set([...explicit, ...generated].filter(Boolean))).slice(0, 10);
}

function topicCluster(row: SeoBrandRow) {
  const service = serviceName(row);
  const area = areaName(row);
  const audience = row.target_customers ?? "qualified local customers";
  const seeds = keywordSeeds(row);

  return [
    {
      title: `${service} in ${area}: customer questions and next steps`,
      keyword: seeds[0],
      type: "blog" as const,
      angle: `Answer practical questions ${audience} ask before contacting ${row.brand_name}.`
    },
    {
      title: `${service} in ${area}`,
      keyword: seeds[1] ?? `${service} ${area}`,
      type: "service_page" as const,
      angle: `Create a conversion-focused service page using only confirmed brand facts.`
    },
    {
      title: `${area} service area page`,
      keyword: seeds[2] ?? `${area} ${service}`,
      type: "city_page" as const,
      angle: `Draft a local page that explains service fit, areas covered, and how to request help.`
    },
    {
      title: `${service} comparison and decision guide`,
      keyword: seeds[3] ?? `${service} questions`,
      type: "blog" as const,
      angle: `Help buyers compare options without making unverified superiority claims.`
    }
  ];
}

function safetyLine(row: SeoBrandRow) {
  const legal = row.risk_profile === "legal_sensitive" ? " Avoid legal advice, medical claims, and outcome predictions." : "";
  return `Draft-only. Use real brand data only. Do not invent guarantees, pricing, reviews, licensing, insurance, or results.${legal}`;
}

function draftBody(row: SeoBrandRow, topic: ReturnType<typeof topicCluster>[number]) {
  const service = serviceName(row);
  const area = areaName(row);
  const tone = row.tone_of_voice ?? "clear, useful, local, and professional";
  const cta = row.cta_goals ?? "request help";
  const services = row.services.map((item) => item.name).slice(0, 6).join(", ") || service;
  const pages = row.landing_pages.map((page) => page.title).slice(0, 6).join(", ") || "related service and city pages";

  return [
    `# ${topic.title}`,
    "",
    `Primary keyword: ${topic.keyword}`,
    `Intent: ${topic.type === "blog" ? "educational and commercial" : "local service conversion"}`,
    `Tone: ${tone}`,
    "",
    "## Search intent",
    topic.angle,
    "",
    "## Draft copy",
    `${row.brand_name} helps ${row.target_customers ?? "customers"} with ${services} in ${area}. This page should make the next step easy without overpromising or using facts that are not in the brand profile.`,
    "",
    `Customers looking for ${service} usually want to understand fit, timing, service area, and what details to share before they contact a business. Keep the content practical and focused on what ${row.brand_name} can actually support.`,
    "",
    "## Suggested sections",
    `- What ${service} includes`,
    `- Who this helps`,
    `- Service areas around ${area}`,
    "- Questions to ask before getting started",
    "- What information to send with the request",
    `- Call to action: ${cta}`,
    "",
    "## Internal links to consider",
    pages,
    "",
    "## Meta title",
    `${topic.title} | ${row.brand_name}`,
    "",
    "## Meta description",
    `Learn about ${service} in ${area} from ${row.brand_name}. Review service fit, next steps, and how to ${cta}.`,
    "",
    safetyLine(row)
  ].join("\n");
}

async function loadSeoBrandRows(workspaceId: string) {
  const result = await queryPostgres<SeoBrandRow>(
    `
    select
      b.tenant_id,
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      b.business_model,
      b.industry,
      b.description,
      b.primary_goal,
      b.primary_location,
      b.risk_profile,
      s.target_customers,
      s.cta_goals,
      s.seo_targets,
      s.tone_of_voice,
      coalesce(services.items, '[]'::jsonb) as services,
      coalesce(locations.items, '[]'::jsonb) as locations,
      coalesce(pages.items, '[]'::jsonb) as landing_pages,
      coalesce(keywords.items, '[]'::jsonb) as seo_keywords
    from public.brands b
    left join public.brand_marketing_settings s on s.tenant_id = b.tenant_id and s.brand_id = b.id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', name, 'description', description, 'priority', priority) order by priority desc, name) as items
      from public.brand_services
      where tenant_id = b.tenant_id and brand_id = b.id and active = true
    ) services on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('city', city, 'state', state, 'service_area_name', service_area_name, 'priority', priority) order by priority desc) as items
      from public.brand_locations
      where tenant_id = b.tenant_id and brand_id = b.id and active = true
    ) locations on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'page_type', page_type, 'primary_keyword', primary_keyword, 'status', status) order by title) as items
      from public.brand_landing_pages
      where tenant_id = b.tenant_id and brand_id = b.id and status <> 'archived'
    ) pages on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('keyword', keyword, 'intent', intent, 'priority', priority, 'target_url', target_url) order by priority desc, keyword) as items
      from public.brand_seo_keywords
      where tenant_id = b.tenant_id and brand_id = b.id
    ) keywords on true
    where b.tenant_id = $1 and b.status = 'active'
    order by b.name
    `,
    [workspaceId]
  );

  return result?.rows ?? [];
}

export async function getSeoAutopilotSummary(): Promise<SeoAutopilotSummary[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    brand_id: string;
    brand_name: string;
    keyword_count: string;
    page_count: string;
    recent_draft_count: string;
    top_keywords: string[];
  }>(
    `
    select
      b.id as brand_id,
      b.name as brand_name,
      (select count(*) from public.brand_seo_keywords k where k.tenant_id = b.tenant_id and k.brand_id = b.id) as keyword_count,
      (select count(*) from public.brand_landing_pages p where p.tenant_id = b.tenant_id and p.brand_id = b.id and p.status <> 'archived') as page_count,
      (
        select count(*)
        from public.ai_drafts d
        where d.tenant_id = b.tenant_id
          and d.brand_id = b.id
          and d.metadata_json->>'generator' = 'seo_autopilot_foundation'
          and d.created_at >= now() - interval '30 days'
      ) as recent_draft_count,
      coalesce(
        (
          select array_agg(keyword order by priority desc, keyword)
          from (
            select keyword, priority
            from public.brand_seo_keywords
            where tenant_id = b.tenant_id and brand_id = b.id
            order by priority desc, keyword
            limit 5
          ) ranked
        ),
        array[]::text[]
      ) as top_keywords
    from public.brands b
    where b.tenant_id = $1 and b.status = 'active'
    order by b.name
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => {
    const topKeywords = row.top_keywords ?? [];
    const fallbackTopic = topKeywords[0] ?? `${row.brand_name} service area SEO`;
    return {
      brandId: row.brand_id,
      brandName: row.brand_name,
      keywordCount: Number(row.keyword_count),
      pageCount: Number(row.page_count),
      recentDraftCount: Number(row.recent_draft_count),
      topKeywords,
      nextTopics: [
        `${fallbackTopic} guide`,
        `${row.brand_name} city/service page`,
        `${row.brand_name} content refresh`
      ]
    };
  });
}

export async function generateSeoAutopilotDrafts(workspaceId: string): Promise<GenerateSeoAutopilotResult> {
  const rows = await loadSeoBrandRows(workspaceId);
  let draftsCreated = 0;
  let recommendationsCreated = 0;
  let calendarItemsCreated = 0;

  for (const row of rows) {
    const topics = topicCluster(row);

    await queryPostgres(
      `
      delete from public.ai_drafts
      where tenant_id = $1
        and brand_id = $2
        and metadata_json->>'generator' = 'seo_autopilot_foundation'
        and created_at >= date_trunc('week', now())
      `,
      [row.tenant_id, row.brand_id]
    );

    for (const [index, topic] of topics.entries()) {
      const contentType = topic.type === "service_page" ? "service_page" : topic.type === "city_page" ? "city_page" : "blog";
      const sourceResult = await queryPostgres<{ id: string }>(
        `
        insert into public.growth_sources (
          tenant_id,
          brand_id,
          source_family,
          source_name,
          campaign_name,
          service_focus,
          city_focus,
          landing_url,
          tracking_code,
          metadata_json
        )
        values ($1, $2, 'organic', $3, 'SEO autopilot', $4, $5, $6, $7, $8::jsonb)
        on conflict (tenant_id, brand_id, source_family, source_name, campaign_name, service_focus, city_focus)
        do update set updated_at = now(), landing_url = excluded.landing_url, tracking_code = excluded.tracking_code
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          topic.keyword,
          serviceName(row),
          areaName(row),
          `/${slugify(topic.title)}`,
          `seo:${row.brand_slug}:${slugify(topic.keyword)}`,
          JSON.stringify({ generator: "seo_autopilot_foundation", topicType: topic.type, draftOnly: true })
        ]
      );
      const sourceId = sourceResult?.rows[0]?.id ?? null;
      const draftResult = await queryPostgres<{ id: string }>(
        `
        insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level)
        values ($1, $2, $3, $4, $5, $6::jsonb, 'draft', $7)
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          contentType,
          topic.title,
          draftBody(row, topic),
          JSON.stringify({
            generator: "seo_autopilot_foundation",
            keyword: topic.keyword,
            topicType: topic.type,
            slugSuggestion: slugify(topic.title),
            growthSourceId: sourceId,
            draftOnly: true,
            noExternalPublishing: true
          }),
          row.risk_profile === "legal_sensitive" ? "high" : index === 0 ? "low" : "medium"
        ]
      );
      const draftId = draftResult?.rows[0]?.id;
      if (!draftId) continue;
      draftsCreated += 1;

      await queryPostgres(
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
        values ($1, $2, 'ai_draft', $3, $4, $5, 'draft', now() + ($6::int * interval '1 day'), $7, $8, $9::jsonb)
        `,
        [
          row.tenant_id,
          row.brand_id,
          draftId,
          topic.title,
          topic.type === "service_page" ? "service_page" : topic.type === "city_page" ? "city_page" : "seo_blog",
          index + 1,
          row.risk_profile === "legal_sensitive" ? "high" : index === 0 ? "low" : "medium",
          `SEO autopilot draft for ${topic.keyword}. Review before publishing.`,
          JSON.stringify({ generator: "seo_autopilot_foundation", draftOnly: true })
        ]
      );
      calendarItemsCreated += 1;

      await queryPostgres(
        `
        insert into public.content_quality_reviews (
          tenant_id,
          brand_id,
          draft_id,
          quality_status,
          usefulness_score,
          local_relevance_score,
          originality_score,
          conversion_clarity_score,
          risk_flags,
          metadata_json
        )
        values ($1, $2, $3, 'needs_review', 72, 74, 68, 70, array[]::text[], $4::jsonb)
        on conflict (draft_id) do nothing
        `,
        [
          row.tenant_id,
          row.brand_id,
          draftId,
          JSON.stringify({
            generator: "seo_autopilot_foundation",
            qualityGate: "operator_review_required",
            spamGuardrail: true
          })
        ]
      );

      await queryPostgres(
        `
        insert into public.publishing_queue (
          tenant_id,
          brand_id,
          draft_id,
          target_platform,
          provider_status,
          queue_status,
          scheduled_for,
          metadata_json
        )
        values ($1, $2, $3, $4, 'not_connected', 'draft', now() + ($5::int * interval '1 day'), $6::jsonb)
        `,
        [
          row.tenant_id,
          row.brand_id,
          draftId,
          contentType === "blog" || contentType === "service_page" || contentType === "city_page" ? "website" : "manual",
          index + 1,
          JSON.stringify({
            generator: "seo_autopilot_foundation",
            providerReadyOnly: true,
            requiresQualityReview: true
          })
        ]
      );

      await queryPostgres(
        `
        insert into public.operator_timeline_events (
          tenant_id,
          brand_id,
          event_family,
          event_type,
          title,
          body,
          primary_entity_type,
          primary_entity_id,
          source_table,
          source_id,
          metadata_json
        )
        values ($1, $2, 'seo', 'draft_created', $3, $4, 'draft', $5, 'ai_drafts', $5, $6::jsonb)
        `,
        [
          row.tenant_id,
          row.brand_id,
          `SEO draft created: ${topic.title}`,
          `Draft-only growth asset for ${topic.keyword}. Quality review and manual approval required before publishing.`,
          draftId,
          JSON.stringify({ sourceId, contentType, topicType: topic.type })
        ]
      );
    }

    await queryPostgres(
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
      values ($1, $2, 'seo', $3, $4, $5, $6, 'medium', 'low', 'low', 'open', 'system', $7::jsonb)
      `,
      [
        row.tenant_id,
        row.brand_id,
        `${row.brand_name}: SEO autopilot refresh`,
        "Review topic clusters, add real Search Console data later, and approve draft-only content before publishing.",
        `The brand has ${row.seo_keywords.length} keyword seeds and ${row.landing_pages.length} page targets. Ferocity can safely prepare drafts now and use live ranking data later.`,
        "Review the generated SEO drafts, pick one page to improve first, and leave live publishing disabled until CMS/Search Console keys are connected.",
        JSON.stringify({
          generator: "seo_autopilot_foundation",
          keywordSeeds: keywordSeeds(row),
          draftOnly: true,
          futureKeys: ["Search Console", "Analytics", "CMS publishing"]
        })
      ]
    );
    recommendationsCreated += 1;
  }

  return {
    brandsProcessed: rows.length,
    draftsCreated,
    recommendationsCreated,
    calendarItemsCreated
  };
}
