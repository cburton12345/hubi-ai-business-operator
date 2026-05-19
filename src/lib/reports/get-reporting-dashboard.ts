import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ReportingDashboard = {
  aiRuns: number;
  fallbackRuns: number;
  exportsCreated: number;
  contentVersions: number;
  analyticsEvents: number;
  integrationsReady: number;
  recentEvents: {
    id: string;
    type: string;
    source: string;
    campaign: string;
    occurredAt: string;
  }[];
};

export async function getReportingDashboard(): Promise<ReportingDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [counts, events] = await Promise.all([
    queryPostgres<{
      ai_runs: string;
      fallback_runs: string;
      exports_created: string;
      content_versions: string;
      analytics_events: string;
      integrations_ready: string;
    }>(
      `
      select
        (select count(*) from public.ai_generation_runs where tenant_id = $1) as ai_runs,
        (select count(*) from public.ai_generation_runs where tenant_id = $1 and fallback_used = true) as fallback_runs,
        (select count(*) from public.content_exports where tenant_id = $1) as exports_created,
        (select count(*) from public.content_versions where tenant_id = $1) as content_versions,
        (select count(*) from public.analytics_events where tenant_id = $1) as analytics_events,
        (select count(*) from public.integration_connections where tenant_id = $1 and status in ('planned', 'connected')) as integrations_ready
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      event_type: string;
      source: string | null;
      campaign_key: string | null;
      occurred_at: Date;
    }>(
      `
      select id, event_type, source, campaign_key, occurred_at
      from public.analytics_events
      where tenant_id = $1
      order by occurred_at desc
      limit 20
      `,
      [workspaceId]
    )
  ]);

  const row = counts?.rows[0];
  return {
    aiRuns: Number(row?.ai_runs ?? 0),
    fallbackRuns: Number(row?.fallback_runs ?? 0),
    exportsCreated: Number(row?.exports_created ?? 0),
    contentVersions: Number(row?.content_versions ?? 0),
    analyticsEvents: Number(row?.analytics_events ?? 0),
    integrationsReady: Number(row?.integrations_ready ?? 0),
    recentEvents: (events?.rows ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      source: event.source ?? "unknown",
      campaign: event.campaign_key ?? "unattributed",
      occurredAt: event.occurred_at.toISOString()
    }))
  };
}
