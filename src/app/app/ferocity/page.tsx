import { FerocityOwnerChat } from "./FerocityOwnerChat";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type SourceEvent = {
  platformName: string;
  title: string;
  summary: string;
  severity: string;
  recommendedAction: string | null;
};

export default async function FerocityChatPage({
  searchParams
}: {
  searchParams: Promise<{ command?: string; source?: string; externalEventId?: string }>;
}) {
  const params = await searchParams;

  let sourceEvent: SourceEvent | null = null;
  if (params.source === "h4r" && params.externalEventId?.startsWith("h4r:leasing-owner-alert:")) {
    const workspaceId = await getCurrentWorkspaceId();
    const result = await queryPostgres<{
      platform_name: string;
      title: string;
      summary: string;
      severity: string;
      recommended_action: string | null;
    }>(
      `
      select platform_name, title, summary, severity, recommended_action
      from public.owner_command_events
      where tenant_id = $1
        and platform_key = 'h4r'
        and external_event_id = $2
      limit 1
      `,
      [workspaceId, params.externalEventId]
    );
    const row = result?.rows[0];
    if (row) {
      sourceEvent = {
        platformName: row.platform_name,
        title: row.title,
        summary: row.summary,
        severity: row.severity,
        recommendedAction: row.recommended_action
      };
    }
  }

  const contextualCommand = sourceEvent
    ? `Review this ${sourceEvent.platformName} alert and advise me on the next step: ${sourceEvent.title}. ${sourceEvent.summary}`.slice(0, 2000)
    : params.command?.slice(0, 2000) ?? "";

  const workspaceId = await getCurrentWorkspaceId();
  const brandResult = await queryPostgres<{ industry: string | null }>(
    `select industry from public.brands where tenant_id = $1 order by created_at asc limit 1`,
    [workspaceId]
  );

  return <FerocityOwnerChat initialCommand={contextualCommand} sourceEvent={sourceEvent} industry={brandResult?.rows[0]?.industry ?? null} />;
}
