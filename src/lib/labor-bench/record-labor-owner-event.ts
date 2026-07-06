import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";

type LaborOwnerEventInput = {
  tenantId: string;
  externalEventId: string;
  eventType:
    | "labor.request.created"
    | "labor.request.updated"
    | "labor.worker.available"
    | "labor.worker.updated"
    | "labor.matches.generated"
    | "labor.match.updated";
  title: string;
  summary: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  status?: "open" | "needs_owner" | "critical" | "ai_handled" | "watching" | "resolved" | "archived";
  ownerAttention?: boolean;
  recommendedAction?: string;
  actionHref?: string;
  confidenceScore?: number;
  metadata?: Record<string, unknown>;
};

export async function recordLaborOwnerEvent(input: LaborOwnerEventInput) {
  try {
    await queryPostgres(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, money_cents, risk_type, confidence_score, metadata_json, occurred_at
      )
      values ($1, 'ferocity-labor', 'Ferocity Labor Bench', $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, 0, 'approval', $12, $13::jsonb, now())
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
      set event_type = excluded.event_type,
          title = excluded.title,
          summary = excluded.summary,
          severity = excluded.severity,
          status = excluded.status,
          owner_attention = excluded.owner_attention,
          ai_summary = excluded.ai_summary,
          recommended_action = excluded.recommended_action,
          action_href = excluded.action_href,
          confidence_score = excluded.confidence_score,
          metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
          occurred_at = excluded.occurred_at,
          updated_at = now()
      `,
      [
        input.tenantId,
        input.externalEventId,
        input.eventType,
        input.title,
        input.summary,
        input.severity ?? "medium",
        input.status ?? "needs_owner",
        input.ownerAttention ?? true,
        "Ferocity recorded the labor signal and kept contact or placement behind owner approval.",
        input.recommendedAction ?? "Open Labor Bench and review the next step.",
        input.actionHref ?? "/app/labor-bench",
        input.confidenceScore ?? 88,
        JSON.stringify({
          source: "labor_bench",
          approvalRequired: true,
          ...input.metadata
        })
      ]
    );
  } catch (error) {
    await logAppError({
      source: "labor-bench.owner-event",
      message: error instanceof Error ? error.message : "Failed to record labor owner event.",
      severity: "warning",
      metadata: {
        eventType: input.eventType,
        externalEventId: input.externalEventId
      }
    });
  }
}
