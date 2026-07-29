import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type AuthorityDashboard = {
  metrics: {
    authorityScore: number;
    completedJobs: number;
    unprocessedJobs: number;
    proofItems: number;
    approvedProofItems: number;
    reviewRequests: number;
    contentDrafts: number;
    publishingQueue: number;
    openGaps: number;
    openEvents: number;
    videoProjects: number;
    websiteRecommendations: number;
    activeBacklinks: number;
    linkRisks: number;
    linkOpportunities: number;
  };
  score: {
    score: number;
    reviewScore: number;
    projectProofScore: number;
    contentScore: number;
    websiteScore: number;
    consistencyScore: number;
    explanations: string[];
    missingSignals: string[];
  };
  opportunities: AuthorityRow[];
  completedAssets: AuthorityRow[];
  publishingQueue: AuthorityRow[];
  contentGaps: AuthorityRow[];
  projectsAwaitingProcessing: AuthorityJob[];
  reviewPipeline: AuthorityRow[];
  videoPipeline: AuthorityRow[];
  websiteRecommendations: AuthorityRow[];
  scoreHistory: AuthorityScoreHistoryRow[];
  scoreEvents: AuthorityRow[];
};

export type AuthorityRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  meta: string;
  href?: string;
};

export type AuthorityJob = {
  id: string;
  title: string;
  customerName: string;
  completedAt: string | null;
  status: string;
};

export type AuthorityScoreHistoryRow = {
  id: string;
  score: number;
  reviewScore: number;
  projectProofScore: number;
  contentScore: number;
  websiteScore: number;
  consistencyScore: number;
  calculatedAt: string;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type AuthorityBundleDetail = {
  id: string;
  title: string;
  summary: string;
  status: string;
  jobTitle: string;
  customerName: string;
  drafts: AuthorityRow[];
  queueItems: AuthorityRow[];
  proofRequests: AuthorityRow[];
  reviewRequests: AuthorityRow[];
  knowledgeArticles: AuthorityRow[];
};

export async function getAuthorityBundleDetail(bundleId: string): Promise<AuthorityBundleDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const bundleResult = await queryPostgres<{
    id: string;
    title: string;
    summary: string | null;
    status: string;
    job_id: string | null;
    customer_id: string | null;
    job_title: string | null;
    customer_name: string | null;
  }>(
    `
    select b.id, b.title, b.summary, b.status, b.job_id, b.customer_id, j.title as job_title, c.name as customer_name
    from public.authority_content_bundles b
    left join public.service_jobs j on j.id = b.job_id and j.tenant_id = b.tenant_id
    left join public.customers c on c.id = b.customer_id and c.tenant_id = b.tenant_id
    where b.tenant_id = $1 and b.id = $2
    limit 1
    `,
    [workspaceId, bundleId]
  );
  const bundle = bundleResult?.rows[0];
  if (!bundle) return null;

  const [draftResult, queueResult, proofResult, reviewResult, knowledgeResult] = await Promise.all([
    queryPostgres<{ id: string; title: string | null; content_type: string; status: string; risk_level: string }>(
      `
      select id, title, content_type, status, risk_level
      from public.ai_drafts
      where tenant_id = $1 and metadata_json->>'bundleId' = $2
      order by created_at desc
      `,
      [workspaceId, bundleId]
    ),
    queryPostgres<{ id: string; target_platform: string; queue_status: string; provider_status: string; title: string | null }>(
      `
      select q.id, q.target_platform, q.queue_status, q.provider_status, d.title
      from public.publishing_queue q
      left join public.ai_drafts d on d.id = q.draft_id
      where q.tenant_id = $1 and q.metadata_json->>'bundleId' = $2
      order by q.created_at desc
      `,
      [workspaceId, bundleId]
    ),
    queryPostgres<{ id: string; public_token: string; request_type: string; status: string }>(
      `
      select id, public_token, request_type, status
      from public.ugc_capture_requests
      where tenant_id = $1 and metadata_json->>'bundleId' = $2
      order by created_at desc
      `,
      [workspaceId, bundleId]
    ),
    queryPostgres<{ id: string; trigger_event: string; channel: string; status: string }>(
      `
      select id, trigger_event, channel, status
      from public.review_request_workflows
      where tenant_id = $1 and metadata_json->>'bundleId' = $2
      order by created_at desc
      `,
      [workspaceId, bundleId]
    ),
    queryPostgres<{ id: string; title: string; article_type: string; status: string }>(
      `
      select id, title, article_type, status
      from public.authority_knowledge_articles
      where tenant_id = $1 and metadata_json->>'bundleId' = $2
      order by created_at desc
      `,
      [workspaceId, bundleId]
    )
  ]);

  return {
    id: bundle.id,
    title: bundle.title,
    summary: bundle.summary ?? "",
    status: bundle.status,
    jobTitle: bundle.job_title ?? "Completed job",
    customerName: bundle.customer_name ?? "Customer",
    drafts: (draftResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? row.content_type.replaceAll("_", " "),
      detail: row.content_type.replaceAll("_", " "),
      status: row.status,
      meta: row.risk_level
    })),
    queueItems: (queueResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? row.target_platform.replaceAll("_", " "),
      detail: row.target_platform.replaceAll("_", " "),
      status: row.queue_status,
      meta: row.provider_status.replaceAll("_", " ")
    })),
    proofRequests: (proofResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.request_type.replaceAll("_", " "),
      detail: `/proof/${row.public_token}`,
      status: row.status,
      meta: "proof"
    })),
    reviewRequests: (reviewResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.trigger_event.replaceAll("_", " "),
      detail: row.channel,
      status: row.status,
      meta: "review"
    })),
    knowledgeArticles: (knowledgeResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.article_type.replaceAll("_", " "),
      status: row.status,
      meta: "knowledge"
    }))
  };
}

function asCount(value: unknown) {
  return Number(value ?? 0);
}

function asIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getAuthorityDashboard(): Promise<AuthorityDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [
    metricResult,
    opportunityResult,
    completedAssetsResult,
    queueResult,
    gapResult,
    unprocessedJobsResult,
    reviewResult,
    videoResult,
    websiteResult,
    scoreHistoryResult,
    scoreEventResult
  ] = await Promise.all([
    queryPostgres<Record<string, string>>(
      `
      select
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'completed')::text as completed_jobs,
        (
          select count(*)
          from public.service_jobs j
          where j.tenant_id = $1
            and j.status = 'completed'
            and not exists (
              select 1 from public.authority_content_bundles b
              where b.tenant_id = j.tenant_id and b.job_id = j.id and b.bundle_type = 'completed_job'
            )
        )::text as unprocessed_jobs,
        (select count(*) from public.ugc_submissions where tenant_id = $1)::text as proof_items,
        (select count(*) from public.ugc_submissions where tenant_id = $1 and status = 'approved')::text as approved_proof_items,
        (select count(*) from public.review_request_workflows where tenant_id = $1)::text as review_requests,
        (
          select count(*)
          from public.ai_drafts
          where tenant_id = $1
            and content_type in ('case_study','faq','blog','gbp_post','facebook_post','service_page','city_page','video_script','newsletter','internal_training_note','schema_markup','website_recommendation')
        )::text as content_drafts,
        (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status in ('draft','needs_approval','approved','scheduled'))::text as publishing_queue,
        (select count(*) from public.authority_content_gaps where tenant_id = $1 and status in ('open','planned','drafted'))::text as open_gaps,
        (select count(*) from public.authority_events where tenant_id = $1 and status in ('open','in_progress','needs_review','blocked'))::text as open_events,
        (select count(*) from public.marketing_video_jobs where tenant_id = $1 and status in ('draft','needs_review','provider_ready','submitted','processing'))::text as video_projects,
        (select count(*) from public.authority_website_recommendations where tenant_id = $1 and status in ('open','drafted','approved'))::text as website_recommendations
        ,(select count(*) from public.authority_backlinks where tenant_id = $1 and status = 'active')::text as active_backlinks
        ,(select count(*) from public.authority_backlinks where tenant_id = $1 and status in ('lost','suspicious'))::text as link_risks
        ,(select count(*) from public.authority_link_opportunities where tenant_id = $1 and status not in ('earned','dismissed'))::text as link_opportunities
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      priority: string;
      created_at: Date;
    }>(
      `
      select id, title, summary, status, priority, created_at
      from public.authority_events
      where tenant_id = $1 and status in ('open','in_progress','needs_review','blocked')
      order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      draft_count: number;
      created_at: Date;
    }>(
      `
      select id, title, summary, status, draft_count, created_at
      from public.authority_content_bundles
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      target_platform: string;
      queue_status: string;
      provider_status: string;
      created_at: Date;
      title: string | null;
    }>(
      `
      select q.id, q.target_platform, q.queue_status, q.provider_status, q.created_at, d.title
      from public.publishing_queue q
      left join public.ai_drafts d on d.id = q.draft_id
      where q.tenant_id = $1
      order by q.created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      why_it_matters: string | null;
      status: string;
      priority: string;
      gap_type: string;
    }>(
      `
      select id, title, why_it_matters, status, priority, gap_type
      from public.authority_content_gaps
      where tenant_id = $1 and status in ('open','planned','drafted')
      order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      status: string;
      completed_at: Date | null;
      updated_at: Date;
      customer_name: string | null;
    }>(
      `
      select j.id, j.title, j.status, j.updated_at as completed_at, j.updated_at, c.name as customer_name
      from public.service_jobs j
      left join public.customers c on c.id = j.customer_id and c.tenant_id = j.tenant_id
      where j.tenant_id = $1
        and j.status = 'completed'
        and not exists (
          select 1 from public.authority_content_bundles b
          where b.tenant_id = j.tenant_id and b.job_id = j.id and b.bundle_type = 'completed_job'
        )
      order by j.updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      trigger_event: string;
      status: string;
      channel: string;
      scheduled_for: Date | null;
      customer_name: string | null;
    }>(
      `
      select r.id, r.trigger_event, r.status, r.channel, r.scheduled_for, c.name as customer_name
      from public.review_request_workflows r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      where r.tenant_id = $1
      order by r.created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      service_label: string | null;
      goal: string | null;
      status: string;
      provider_key: string;
      created_at: Date;
    }>(
      `
      select id, service_label, goal, status, provider_key, created_at
      from public.marketing_video_jobs
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      recommendation: string | null;
      status: string;
      priority: string;
      recommendation_type: string;
    }>(
      `
      select id, title, recommendation, status, priority, recommendation_type
      from public.authority_website_recommendations
      where tenant_id = $1
      order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      score: number;
      review_score: number;
      project_proof_score: number;
      content_score: number;
      website_score: number;
      consistency_score: number;
      calculated_at: Date;
    }>(
      `
      select id, score, review_score, project_proof_score, content_score, website_score, consistency_score, calculated_at
      from public.authority_score_snapshots
      where tenant_id = $1
      order by calculated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      priority: string;
      event_type: string;
    }>(
      `
      select id, title, summary, status, priority, event_type
      from public.authority_events
      where tenant_id = $1
        and event_type in ('score_updated','asset_created','content_gap_found','website_recommendation','job_completed')
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    )
  ]);

  const metricsRow = metricResult?.rows[0] ?? {};
  const metrics = {
    completedJobs: asCount(metricsRow.completed_jobs),
    unprocessedJobs: asCount(metricsRow.unprocessed_jobs),
    proofItems: asCount(metricsRow.proof_items),
    approvedProofItems: asCount(metricsRow.approved_proof_items),
    reviewRequests: asCount(metricsRow.review_requests),
    contentDrafts: asCount(metricsRow.content_drafts),
    publishingQueue: asCount(metricsRow.publishing_queue),
    openGaps: asCount(metricsRow.open_gaps),
    openEvents: asCount(metricsRow.open_events),
    videoProjects: asCount(metricsRow.video_projects),
    websiteRecommendations: asCount(metricsRow.website_recommendations),
    activeBacklinks: asCount(metricsRow.active_backlinks),
    linkRisks: asCount(metricsRow.link_risks),
    linkOpportunities: asCount(metricsRow.link_opportunities),
    authorityScore: 0
  };

  const reviewScore = clampScore(metrics.reviewRequests * 10 + metrics.approvedProofItems * 8);
  const projectProofScore = clampScore(metrics.completedJobs * 6 + metrics.proofItems * 8 + metrics.approvedProofItems * 10);
  const contentScore = clampScore(metrics.contentDrafts * 5 + metrics.publishingQueue * 4 + metrics.activeBacklinks * 2);
  const websiteScore = clampScore(Math.max(0, 65 - metrics.websiteRecommendations * 8) + metrics.contentDrafts * 2);
  const consistencyScore = clampScore(metrics.completedJobs > 0 ? 50 + Math.min(40, metrics.contentDrafts * 3) - metrics.unprocessedJobs * 6 : 20);
  const authorityScore = clampScore((reviewScore + projectProofScore + contentScore + websiteScore + consistencyScore) / 5);
  metrics.authorityScore = authorityScore;

  const explanations = [
    `${metrics.completedJobs} completed jobs can become authority assets.`,
    `${metrics.proofItems} proof submissions and ${metrics.approvedProofItems} approved proof items support trust.`,
    `${metrics.contentDrafts} authority drafts and ${metrics.publishingQueue} publishing queue items are ready for review.`,
    `${metrics.reviewRequests} review workflows help build reputation.`
    ,`${metrics.activeBacklinks} verified backlinks and ${metrics.linkOpportunities} open link opportunities connect authority work to outside discovery.`
  ];
  const missingSignals = [
    metrics.unprocessedJobs > 0 ? `${metrics.unprocessedJobs} completed jobs still need authority bundles.` : null,
    metrics.proofItems === 0 ? "No project photos, testimonials, or proof submissions are recorded yet." : null,
    metrics.reviewRequests === 0 ? "No review request workflow is queued yet." : null,
    metrics.websiteRecommendations > 0 ? `${metrics.websiteRecommendations} website authority improvements are open.` : null,
    metrics.contentDrafts === 0 ? "No case studies, FAQs, blogs, posts, or video scripts are drafted yet." : null
    ,metrics.linkRisks > 0 ? `${metrics.linkRisks} lost or suspicious backlinks need verification.` : null
  ].filter(Boolean) as string[];

  return {
    metrics,
    score: {
      score: authorityScore,
      reviewScore,
      projectProofScore,
      contentScore,
      websiteScore,
      consistencyScore,
      explanations,
      missingSignals
    },
    opportunities: (opportunityResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.summary ?? "Review this authority opportunity.",
      status: row.status,
      meta: row.priority
    })),
    completedAssets: (completedAssetsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.summary ?? "Authority bundle prepared from real work.",
      status: row.status,
      meta: `${row.draft_count} drafts`,
      href: `/app/authority/bundles/${row.id}`
    })),
    publishingQueue: (queueResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? row.target_platform.replaceAll("_", " "),
      detail: row.target_platform.replaceAll("_", " "),
      status: row.queue_status,
      meta: row.provider_status.replaceAll("_", " ")
    })),
    contentGaps: (gapResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.why_it_matters ?? "This gap weakens helpful coverage.",
      status: row.status,
      meta: row.gap_type.replaceAll("_", " ")
    })),
    projectsAwaitingProcessing: (unprocessedJobsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      customerName: row.customer_name ?? "Customer",
      completedAt: row.completed_at?.toISOString() ?? null,
      status: row.status
    })),
    reviewPipeline: (reviewResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.customer_name ? `Review request for ${row.customer_name}` : "Review request",
      detail: row.trigger_event.replaceAll("_", " "),
      status: row.status,
      meta: row.channel
    })),
    videoPipeline: (videoResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.service_label || row.goal || "Video idea",
      detail: row.goal ?? "Short-form video or script draft.",
      status: row.status,
      meta: row.provider_key.replaceAll("_", " ")
    })),
    websiteRecommendations: (websiteResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.recommendation ?? "Review this website authority improvement.",
      status: row.status,
      meta: row.recommendation_type.replaceAll("_", " ")
    })),
    scoreHistory: (scoreHistoryResult?.rows ?? []).reverse().map((row) => ({
      id: row.id,
      score: Number(row.score),
      reviewScore: Number(row.review_score),
      projectProofScore: Number(row.project_proof_score),
      contentScore: Number(row.content_score),
      websiteScore: Number(row.website_score),
      consistencyScore: Number(row.consistency_score),
      calculatedAt: asIso(row.calculated_at)
    })),
    scoreEvents: (scoreEventResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.summary ?? "Authority score signal changed.",
      status: row.status,
      meta: row.event_type.replaceAll("_", " ")
    }))
  };
}
