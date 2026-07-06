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

export type SeoPageOpportunitySummary = {
  id: string;
  brandName: string;
  title: string;
  pageType: string;
  targetKeyword: string | null;
  priorityScore: number;
  status: string;
  nextStep: string;
};

export type SeoTrafficEngineDashboard = {
  metrics: {
    visibilityChecks: number;
    strategyItems: number;
    authorityTasks: number;
    publishingConnections: number;
  };
  visibilityChecks: {
    id: string;
    brandName: string;
    platformKey: string;
    checkName: string;
    queryText: string;
    status: string;
    score: number | null;
  }[];
  strategyItems: {
    id: string;
    brandName: string;
    contentType: string;
    title: string;
    targetKeyword: string | null;
    publishTarget: string;
    status: string;
    scheduledFor: string | null;
    priorityScore: number;
  }[];
  authorityTasks: {
    id: string;
    brandName: string;
    taskType: string;
    title: string;
    status: string;
    priorityScore: number;
  }[];
  publishingConnections: {
    id: string;
    brandName: string;
    providerKey: string;
    displayName: string;
    status: string;
    livePublishEnabled: boolean;
  }[];
};

export type ActivateSeoTrafficEngineResult = GenerateSeoAutopilotResult & {
  visibilityChecksCreated: number;
  strategyItemsCreated: number;
  authorityTasksCreated: number;
  publishingConnectionsCreated: number;
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

function platformChecks(row: SeoBrandRow) {
  const service = serviceName(row);
  const area = areaName(row);
  return [
    {
      platformKey: "google",
      checkName: "Google local search",
      queryText: `${service} ${area}`
    },
    {
      platformKey: "google_ai_overviews",
      checkName: "Google AI answer surface",
      queryText: `Who should I call for ${service} in ${area}?`
    },
    {
      platformKey: "chatgpt",
      checkName: "ChatGPT recommendation prompt",
      queryText: `Recommend a trustworthy ${service} company near ${area}.`
    },
    {
      platformKey: "perplexity",
      checkName: "Perplexity comparison prompt",
      queryText: `Best ${service} options around ${area} with reviews and proof.`
    },
    {
      platformKey: "reddit",
      checkName: "Reddit/community visibility",
      queryText: `${area} ${service} recommendations`
    },
    {
      platformKey: "google_business_profile",
      checkName: "Google Business Profile activity",
      queryText: `${row.brand_name} Google reviews photos posts`
    }
  ];
}

function contentStrategy(row: SeoBrandRow) {
  const service = serviceName(row);
  const area = areaName(row);
  const base = topicCluster(row);
  return [
    {
      contentType: "service_page",
      title: `${service} service page`,
      targetKeyword: `${service} ${area}`,
      targetPrompt: `Who offers ${service} near ${area}?`,
      publishTarget: "customer_website",
      priorityScore: 92,
      scheduledOffset: 1
    },
    {
      contentType: "city_page",
      title: `${area} ${service} page`,
      targetKeyword: `${area} ${service}`,
      targetPrompt: `Which local company handles ${service} in ${area}?`,
      publishTarget: "customer_website",
      priorityScore: 88,
      scheduledOffset: 4
    },
    {
      contentType: "gbp_post",
      title: `${service} Google Business update`,
      targetKeyword: `${service} help`,
      targetPrompt: `Recent ${service} activity from ${row.brand_name}`,
      publishTarget: "google_business_profile",
      priorityScore: 76,
      scheduledOffset: 7
    },
    {
      contentType: "blog_article",
      title: base[0]?.title ?? `${service} questions in ${area}`,
      targetKeyword: base[0]?.keyword ?? `${service} questions`,
      targetPrompt: `What should customers know before hiring for ${service}?`,
      publishTarget: "customer_website",
      priorityScore: 74,
      scheduledOffset: 10
    },
    {
      contentType: "faq",
      title: `${service} FAQ for ${area}`,
      targetKeyword: `${service} FAQ`,
      targetPrompt: `Answer common ${service} questions for customers in ${area}.`,
      publishTarget: "manual_export",
      priorityScore: 70,
      scheduledOffset: 14
    },
    {
      contentType: "proof_page",
      title: `${service} customer proof and review page`,
      targetKeyword: `${service} reviews ${area}`,
      targetPrompt: `Show real proof, reviews, photos, and completed work for ${service}.`,
      publishTarget: "customer_website",
      priorityScore: 84,
      scheduledOffset: 18
    },
    {
      contentType: "social_post",
      title: `${service} proof post`,
      targetKeyword: `${service} local proof`,
      targetPrompt: `Create a local proof post from completed work and customer permission.`,
      publishTarget: "social",
      priorityScore: 64,
      scheduledOffset: 22
    },
    {
      contentType: "comparison_page",
      title: `${service} decision guide`,
      targetKeyword: `best ${service} ${area}`,
      targetPrompt: `Help customers compare options for ${service} without fake claims.`,
      publishTarget: "customer_website",
      priorityScore: 68,
      scheduledOffset: 28
    }
  ];
}

function authorityTasks(row: SeoBrandRow) {
  const service = serviceName(row);
  const area = areaName(row);
  return [
    {
      taskType: "customer_proof",
      title: "Turn completed jobs into proof",
      description: `Collect photos, reviews, and permission after ${service} jobs in ${area}.`,
      priorityScore: 94
    },
    {
      taskType: "local_citation",
      title: "Check core local listings",
      description: "Confirm name, address/service area, phone, website, categories, and descriptions match across trusted directories.",
      priorityScore: 78
    },
    {
      taskType: "directory_profile",
      title: "Improve service directory profiles",
      description: `Add service details, photos, review links, and clear CTAs for ${service}.`,
      priorityScore: 70
    },
    {
      taskType: "community_visibility",
      title: "Find relevant community questions",
      description: `Look for local Facebook, Reddit, and neighborhood questions where useful ${service} advice would help.`,
      priorityScore: 66
    },
    {
      taskType: "internal_linking",
      title: "Connect service, city, proof, and contact pages",
      description: "Build internal links so visitors and search engines can move from useful content to the quote request.",
      priorityScore: 82
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

export async function getSeoPageOpportunitySummary(): Promise<SeoPageOpportunitySummary[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    title: string;
    page_type: string;
    target_keyword: string | null;
    priority_score: number;
    status: string;
    next_step: string;
  }>(
    `
    select o.id, b.name as brand_name, o.title, o.page_type, o.target_keyword, o.priority_score, o.status, o.next_step
    from public.seo_page_opportunities o
    join public.brands b on b.id = o.brand_id
    where o.tenant_id = $1 and o.status in ('open', 'planned', 'draft_created', 'in_review')
    order by o.priority_score desc, o.detected_at desc
    limit 12
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    title: row.title,
    pageType: row.page_type,
    targetKeyword: row.target_keyword,
    priorityScore: row.priority_score,
    status: row.status,
    nextStep: row.next_step
  }));
}

export async function getSeoTrafficEngineDashboard(): Promise<SeoTrafficEngineDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [visibilityResult, strategyResult, authorityResult, connectionResult] = await Promise.all([
    queryPostgres<{
      id: string;
      brand_name: string;
      platform_key: string;
      check_name: string;
      query_text: string;
      status: string;
      visibility_score: number | null;
    }>(
      `
      select v.id, coalesce(b.name, 'Workspace') as brand_name, v.platform_key, v.check_name, v.query_text, v.status, v.visibility_score
      from public.ai_search_visibility_checks v
      left join public.brands b on b.id = v.brand_id
      where v.tenant_id = $1
      order by v.created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string;
      content_type: string;
      title: string;
      target_keyword: string | null;
      publish_target: string;
      status: string;
      scheduled_for: Date | null;
      priority_score: number;
    }>(
      `
      select s.id, coalesce(b.name, 'Workspace') as brand_name, s.content_type, s.title, s.target_keyword, s.publish_target, s.status, s.scheduled_for, s.priority_score
      from public.seo_content_strategy_items s
      left join public.brands b on b.id = s.brand_id
      where s.tenant_id = $1
      order by s.scheduled_for nulls last, s.priority_score desc, s.created_at desc
      limit 16
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string;
      task_type: string;
      title: string;
      status: string;
      priority_score: number;
    }>(
      `
      select a.id, coalesce(b.name, 'Workspace') as brand_name, a.task_type, a.title, a.status, a.priority_score
      from public.seo_authority_tasks a
      left join public.brands b on b.id = a.brand_id
      where a.tenant_id = $1
      order by a.priority_score desc, a.created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string;
      provider_key: string;
      display_name: string;
      status: string;
      live_publish_enabled: boolean;
    }>(
      `
      select c.id, coalesce(b.name, 'Workspace') as brand_name, c.provider_key, c.display_name, c.status, c.live_publish_enabled
      from public.brand_publishing_connections c
      left join public.brands b on b.id = c.brand_id
      where c.tenant_id = $1 and c.status <> 'archived'
      order by c.updated_at desc
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const visibilityChecks = (visibilityResult?.rows ?? []).map((item) => ({
    id: item.id,
    brandName: item.brand_name,
    platformKey: item.platform_key,
    checkName: item.check_name,
    queryText: item.query_text,
    status: item.status,
    score: item.visibility_score
  }));
  const strategyItems = (strategyResult?.rows ?? []).map((item) => ({
    id: item.id,
    brandName: item.brand_name,
    contentType: item.content_type,
    title: item.title,
    targetKeyword: item.target_keyword,
    publishTarget: item.publish_target,
    status: item.status,
    scheduledFor: item.scheduled_for ? new Date(item.scheduled_for).toISOString().slice(0, 10) : null,
    priorityScore: item.priority_score
  }));
  const authorityRows = (authorityResult?.rows ?? []).map((item) => ({
    id: item.id,
    brandName: item.brand_name,
    taskType: item.task_type,
    title: item.title,
    status: item.status,
    priorityScore: item.priority_score
  }));
  const publishingConnections = (connectionResult?.rows ?? []).map((item) => ({
    id: item.id,
    brandName: item.brand_name,
    providerKey: item.provider_key,
    displayName: item.display_name,
    status: item.status,
    livePublishEnabled: item.live_publish_enabled
  }));

  return {
    metrics: {
      visibilityChecks: visibilityChecks.length,
      strategyItems: strategyItems.length,
      authorityTasks: authorityRows.length,
      publishingConnections: publishingConnections.length
    },
    visibilityChecks,
    strategyItems,
    authorityTasks: authorityRows,
    publishingConnections
  };
}

export async function activateSeoTrafficEngine(workspaceId: string): Promise<ActivateSeoTrafficEngineResult> {
  const rows = await loadSeoBrandRows(workspaceId);
  const draftResult = await generateSeoAutopilotDrafts(workspaceId);
  let visibilityChecksCreated = 0;
  let strategyItemsCreated = 0;
  let authorityTasksCreated = 0;
  let publishingConnectionsCreated = 0;

  for (const row of rows) {
    for (const connection of [
      {
        providerKey: "manual_export",
        displayName: "Manual export",
        targetUrl: row.landing_pages[0]?.slug ? `/${row.landing_pages[0].slug}` : row.primary_location
      },
      {
        providerKey: "customer_website",
        displayName: "Customer website",
        targetUrl: row.landing_pages[0]?.slug ? `/${row.landing_pages[0].slug}` : null
      },
      {
        providerKey: "google_business_profile",
        displayName: "Google Business Profile",
        targetUrl: null
      }
    ]) {
      const result = await queryPostgres<{ id: string }>(
        `
        insert into public.brand_publishing_connections (
          tenant_id, brand_id, provider_key, display_name, target_url, status, live_publish_enabled, requires_approval, metadata_json
        )
        values ($1, $2, $3, $4, $5, 'not_connected', false, true, $6::jsonb)
        on conflict (tenant_id, brand_id, provider_key)
        do update set updated_at = now(), metadata_json = public.brand_publishing_connections.metadata_json || excluded.metadata_json
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          connection.providerKey,
          connection.displayName,
          connection.targetUrl,
          JSON.stringify({ seededBy: "seo_geo_growth_engine", livePublishDisabled: true, approvalRequired: true })
        ]
      );
      if (result?.rows[0]?.id) publishingConnectionsCreated += 1;
    }

    for (const check of platformChecks(row)) {
      const result = await queryPostgres<{ id: string }>(
        `
        insert into public.ai_search_visibility_checks (
          tenant_id, brand_id, platform_key, check_name, query_text, result_summary, status, next_check_at, metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, 'manual_check', now() + interval '30 days', $7::jsonb)
        on conflict (tenant_id, brand_id, platform_key, query_text)
        do update set
          check_name = excluded.check_name,
          result_summary = excluded.result_summary,
          next_check_at = excluded.next_check_at,
          metadata_json = public.ai_search_visibility_checks.metadata_json || excluded.metadata_json,
          updated_at = now()
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          check.platformKey,
          check.checkName,
          check.queryText,
          "Ready for a human or connected provider to check. Do not claim visibility until evidence is recorded.",
          JSON.stringify({ seededBy: "seo_geo_growth_engine", evidenceRequired: true })
        ]
      );
      if (result?.rows[0]?.id) visibilityChecksCreated += 1;
    }

    for (const item of contentStrategy(row)) {
      const result = await queryPostgres<{ id: string }>(
        `
        insert into public.seo_content_strategy_items (
          tenant_id, brand_id, strategy_name, content_type, title, target_keyword, target_prompt,
          service_focus, city_focus, publish_target, status, scheduled_for, priority_score, metadata_json
        )
        values ($1, $2, '30-day local SEO and AI search plan', $3, $4, $5, $6, $7, $8, $9, 'planned', current_date + ($10::int), $11, $12::jsonb)
        on conflict (tenant_id, brand_id, strategy_name, title, content_type)
        do update set
          target_keyword = excluded.target_keyword,
          target_prompt = excluded.target_prompt,
          service_focus = excluded.service_focus,
          city_focus = excluded.city_focus,
          publish_target = excluded.publish_target,
          scheduled_for = excluded.scheduled_for,
          priority_score = excluded.priority_score,
          metadata_json = public.seo_content_strategy_items.metadata_json || excluded.metadata_json,
          updated_at = now()
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          item.contentType,
          item.title,
          item.targetKeyword,
          item.targetPrompt,
          serviceName(row),
          areaName(row),
          item.publishTarget,
          item.scheduledOffset,
          item.priorityScore,
          JSON.stringify({
            seededBy: "seo_geo_growth_engine",
            draftFirst: true,
            sourcesToUse: ["brand profile", "services", "service areas", "reviews", "customer proof", "lead source data"]
          })
        ]
      );
      if (result?.rows[0]?.id) strategyItemsCreated += 1;
    }

    for (const task of authorityTasks(row)) {
      const result = await queryPostgres<{ id: string }>(
        `
        insert into public.seo_authority_tasks (
          tenant_id, brand_id, task_type, title, description, status, priority_score, due_at, metadata_json
        )
        values ($1, $2, $3, $4, $5, 'open', $6, now() + interval '14 days', $7::jsonb)
        on conflict (tenant_id, brand_id, task_type, title)
        do update set
          description = excluded.description,
          priority_score = excluded.priority_score,
          due_at = excluded.due_at,
          metadata_json = public.seo_authority_tasks.metadata_json || excluded.metadata_json,
          updated_at = now()
        returning id
        `,
        [
          row.tenant_id,
          row.brand_id,
          task.taskType,
          task.title,
          task.description,
          task.priorityScore,
          JSON.stringify({ seededBy: "seo_geo_growth_engine", noSpam: true, noPaidLinkScheme: true })
        ]
      );
      if (result?.rows[0]?.id) authorityTasksCreated += 1;
    }

    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, brand_id, event_family, event_type, title, body, metadata_json
      )
      values ($1, $2, 'seo', 'growth_engine_prepared', $3, $4, $5::jsonb)
      `,
      [
        row.tenant_id,
        row.brand_id,
        `${row.brand_name}: SEO/GEO growth engine prepared`,
        "Ferocity prepared AI-search checks, a 30-day content plan, authority tasks, publishing connection stubs, and draft SEO assets. Live publishing remains off.",
        JSON.stringify({ seededBy: "seo_geo_growth_engine", livePublishingEnabled: false })
      ]
    );
  }

  return {
    ...draftResult,
    visibilityChecksCreated,
    strategyItemsCreated,
    authorityTasksCreated,
    publishingConnectionsCreated
  };
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
