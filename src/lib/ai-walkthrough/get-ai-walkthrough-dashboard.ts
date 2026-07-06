import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type AiWalkthroughDashboard = {
  metrics: {
    sessions: number;
    needsReview: number;
    observations: number;
    estimateItems: number;
    mediaItems: number;
  };
  sessions: {
    id: string;
    title: string;
    walkthroughType: string;
    status: string;
    siteLocation: string;
    confidence: string;
    createdAt: string;
    observations: number;
    estimateItems: number;
    mediaItems: number;
  }[];
  observations: {
    id: string;
    sessionTitle: string;
    observationType: string;
    title: string;
    description: string;
    quantity: string;
    unit: string;
    locationReference: string;
    confidence: string;
    reviewStatus: string;
  }[];
  estimateItems: {
    id: string;
    sessionTitle: string;
    lineItem: string;
    quantity: string;
    unit: string;
    status: string;
    confidence: string;
  }[];
  media: {
    id: string;
    sessionTitle: string;
    mediaType: string;
    aiTitle: string;
    aiDescription: string;
    locationReference: string;
    confidence: string;
    status: string;
  }[];
};

function n(value: unknown) {
  return Number(value ?? 0);
}

export async function getAiWalkthroughDashboard(): Promise<AiWalkthroughDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [metricsResult, sessionsResult, observationsResult, estimateItemsResult, mediaResult] = await Promise.all([
    queryPostgres<{
      sessions: string;
      needs_review: string;
      observations: string;
      estimate_items: string;
      media_items: string;
    }>(
      `
      select
        (select count(*) from public.ai_walkthrough_sessions where tenant_id = $1 and status <> 'archived')::text as sessions,
        (select count(*) from public.ai_walkthrough_observations where tenant_id = $1 and review_status = 'needs_review')::text as needs_review,
        (select count(*) from public.ai_walkthrough_observations where tenant_id = $1)::text as observations,
        (select count(*) from public.ai_walkthrough_estimate_items where tenant_id = $1)::text as estimate_items,
        (select count(*) from public.ai_walkthrough_media where tenant_id = $1 and status <> 'archived')::text as media_items
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      walkthrough_type: string;
      status: string;
      site_location: string | null;
      confidence: string;
      created_at: Date;
      observations: string;
      estimate_items: string;
      media_items: string;
    }>(
      `
      select
        s.id, s.title, s.walkthrough_type, s.status, s.site_location, s.confidence, s.created_at,
        (select count(*) from public.ai_walkthrough_observations o where o.session_id = s.id)::text as observations,
        (select count(*) from public.ai_walkthrough_estimate_items e where e.session_id = s.id)::text as estimate_items,
        (select count(*) from public.ai_walkthrough_media m where m.session_id = s.id and m.status <> 'archived')::text as media_items
      from public.ai_walkthrough_sessions s
      where s.tenant_id = $1 and s.status <> 'archived'
      order by s.created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      session_title: string;
      observation_type: string;
      title: string;
      description: string | null;
      quantity: string | null;
      unit: string | null;
      location_reference: string | null;
      confidence: string;
      review_status: string;
    }>(
      `
      select o.id, s.title as session_title, o.observation_type, o.title, o.description,
        o.quantity::text, o.unit, o.location_reference, o.confidence, o.review_status
      from public.ai_walkthrough_observations o
      join public.ai_walkthrough_sessions s on s.id = o.session_id
      where o.tenant_id = $1
      order by case o.review_status when 'needs_review' then 0 else 1 end, o.created_at desc
      limit 20
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      session_title: string;
      line_item: string;
      quantity: string | null;
      unit: string | null;
      status: string;
      confidence: string;
    }>(
      `
      select e.id, s.title as session_title, e.line_item, e.quantity::text, e.unit, e.status, e.confidence
      from public.ai_walkthrough_estimate_items e
      join public.ai_walkthrough_sessions s on s.id = e.session_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      session_title: string;
      media_type: string;
      ai_title: string | null;
      ai_description: string | null;
      location_reference: string | null;
      confidence: string;
      status: string;
    }>(
      `
      select m.id, s.title as session_title, m.media_type, m.ai_title, m.ai_description,
        m.location_reference, m.confidence, m.status
      from public.ai_walkthrough_media m
      join public.ai_walkthrough_sessions s on s.id = m.session_id
      where m.tenant_id = $1 and m.status <> 'archived'
      order by m.created_at desc
      limit 12
      `,
      [tenantId]
    )
  ]);

  const metrics = metricsResult?.rows[0];

  return {
    metrics: {
      sessions: n(metrics?.sessions),
      needsReview: n(metrics?.needs_review),
      observations: n(metrics?.observations),
      estimateItems: n(metrics?.estimate_items),
      mediaItems: n(metrics?.media_items)
    },
    sessions: (sessionsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      walkthroughType: row.walkthrough_type,
      status: row.status,
      siteLocation: row.site_location ?? "No location",
      confidence: row.confidence,
      createdAt: row.created_at.toISOString(),
      observations: n(row.observations),
      estimateItems: n(row.estimate_items),
      mediaItems: n(row.media_items)
    })),
    observations: (observationsResult?.rows ?? []).map((row) => ({
      id: row.id,
      sessionTitle: row.session_title,
      observationType: row.observation_type,
      title: row.title,
      description: row.description ?? "",
      quantity: row.quantity ?? "",
      unit: row.unit ?? "",
      locationReference: row.location_reference ?? "",
      confidence: row.confidence,
      reviewStatus: row.review_status
    })),
    estimateItems: (estimateItemsResult?.rows ?? []).map((row) => ({
      id: row.id,
      sessionTitle: row.session_title,
      lineItem: row.line_item,
      quantity: row.quantity ?? "",
      unit: row.unit ?? "",
      status: row.status,
      confidence: row.confidence
    })),
    media: (mediaResult?.rows ?? []).map((row) => ({
      id: row.id,
      sessionTitle: row.session_title,
      mediaType: row.media_type,
      aiTitle: row.ai_title ?? "Untitled media",
      aiDescription: row.ai_description ?? "",
      locationReference: row.location_reference ?? "",
      confidence: row.confidence,
      status: row.status
    }))
  };
}
