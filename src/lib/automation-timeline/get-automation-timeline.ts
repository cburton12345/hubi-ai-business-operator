import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type AutomationTimelineEvent = {
  id: string;
  family: string;
  type: string;
  title: string;
  body: string | null;
  occurredAt: string;
  sourceTable: string | null;
  sourceId: string | null;
  primaryEntityType: string | null;
  primaryEntityId: string | null;
  metadata: Record<string, unknown>;
  status: "handled" | "prepared" | "needs_approval" | "blocked" | "synced" | "logged";
};

export type AutomationTimelineDashboard = {
  metrics: {
    total: number;
    prepared: number;
    needsApproval: number;
    blocked: number;
    aiHandled: number;
  };
  familyCounts: { label: string; count: number }[];
  events: AutomationTimelineEvent[];
};

function n(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function statusFor(row: {
  event_family: string;
  event_type: string;
  title: string;
  body: string | null;
  metadata_json: Record<string, unknown> | null;
}): AutomationTimelineEvent["status"] {
  const text = `${row.event_family} ${row.event_type} ${row.title} ${row.body ?? ""}`.toLowerCase();
  const metadata = row.metadata_json ?? {};
  if (text.includes("blocked") || text.includes("failed") || metadata.blocked === true) return "blocked";
  if (text.includes("approval") || text.includes("review") || metadata.requiresApproval === true) return "needs_approval";
  if (text.includes("prepared") || text.includes("draft") || text.includes("queued")) return "prepared";
  if (text.includes("sync") || text.includes("webhook") || text.includes("marketplace")) return "synced";
  if (text.includes("handled") || text.includes("resolved")) return "handled";
  return "logged";
}

export async function getAutomationTimelineDashboard(): Promise<AutomationTimelineDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [metricResult, familyResult, eventResult] = await Promise.all([
    queryPostgres<{
      total: string;
      prepared: string;
      needs_approval: string;
      blocked: string;
      ai_handled: string;
    }>(
      `
      select
        count(*)::text as total,
        count(*) filter (where lower(title || ' ' || coalesce(body, '') || ' ' || event_type) like any(array['%prepared%','%draft%','%queued%']))::text as prepared,
        count(*) filter (where lower(title || ' ' || coalesce(body, '') || ' ' || event_type) like any(array['%approval%','%review%']))::text as needs_approval,
        count(*) filter (where lower(title || ' ' || coalesce(body, '') || ' ' || event_type) like any(array['%blocked%','%failed%']))::text as blocked,
        count(*) filter (where lower(title || ' ' || coalesce(body, '') || ' ' || event_type) like any(array['%handled%','%resolved%','%ran%']))::text as ai_handled
      from public.operator_timeline_events
      where tenant_id = $1
        and occurred_at >= now() - interval '30 days'
      `,
      [workspaceId]
    ),
    queryPostgres<{ event_family: string; count: string }>(
      `
      select event_family, count(*)::text as count
      from public.operator_timeline_events
      where tenant_id = $1
        and occurred_at >= now() - interval '30 days'
      group by event_family
      order by count(*) desc, event_family
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      event_family: string;
      event_type: string;
      title: string;
      body: string | null;
      occurred_at: string;
      source_table: string | null;
      source_id: string | null;
      primary_entity_type: string | null;
      primary_entity_id: string | null;
      metadata_json: Record<string, unknown> | null;
    }>(
      `
      select id, event_family, event_type, title, body, occurred_at, source_table, source_id,
        primary_entity_type, primary_entity_id, metadata_json
      from public.operator_timeline_events
      where tenant_id = $1
      order by occurred_at desc
      limit 80
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricResult?.rows[0];
  const events = (eventResult?.rows ?? []).map((event) => ({
    id: event.id,
    family: event.event_family,
    type: event.event_type,
    title: event.title,
    body: event.body,
    occurredAt: event.occurred_at,
    sourceTable: event.source_table,
    sourceId: event.source_id,
    primaryEntityType: event.primary_entity_type,
    primaryEntityId: event.primary_entity_id,
    metadata: event.metadata_json ?? {},
    status: statusFor(event)
  }));

  return {
    metrics: {
      total: n(metrics?.total),
      prepared: n(metrics?.prepared),
      needsApproval: n(metrics?.needs_approval),
      blocked: n(metrics?.blocked),
      aiHandled: n(metrics?.ai_handled)
    },
    familyCounts: (familyResult?.rows ?? []).map((row) => ({ label: row.event_family, count: n(row.count) })),
    events
  };
}
