import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OperatorAlertRow = {
  id: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  actionHref: string;
  lastSeenAt: string;
};

export async function getOperatorAlertRows(): Promise<OperatorAlertRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    category: string;
    severity: string;
    status: string;
    title: string;
    summary: string;
    action_href: string | null;
    last_seen_at: Date;
  }>(
    `
    select id, category, severity, status, title, summary, action_href, last_seen_at
    from public.operator_alerts
    where tenant_id = $1
    order by
      case status when 'active' then 0 else 1 end,
      case severity when 'high' then 0 when 'medium' then 1 else 2 end,
      last_seen_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    title: row.title,
    summary: row.summary,
    actionHref: row.action_href ?? "/app",
    lastSeenAt: row.last_seen_at.toISOString()
  }));
}
