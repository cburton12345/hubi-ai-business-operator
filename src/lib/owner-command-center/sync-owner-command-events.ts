import { queryPostgres } from "@/lib/db/postgres";

type TimelineRow = {
  id: string;
  brand_id: string | null;
  event_family: string;
  event_type: string;
  title: string;
  body: string | null;
  primary_entity_type: string | null;
  primary_entity_id: string | null;
  metadata_json: Record<string, unknown>;
  occurred_at: Date;
};

type OwnerEventInput = {
  platformKey: string;
  platformName: string;
  externalEventId: string;
  eventType: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "watching" | "needs_owner";
  ownerAttention: boolean;
  aiHandled: boolean;
  aiSummary: string | null;
  recommendedAction: string;
  actionHref: string;
  moneyCents: number;
  riskType: "revenue" | "financial" | "customer" | "legal" | "safety" | "automation" | "low_confidence" | "approval" | null;
  confidenceScore: number;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

function textIncludes(row: TimelineRow, words: string[]) {
  const text = `${row.event_family} ${row.event_type} ${row.title} ${row.body ?? ""}`.toLowerCase();
  return words.some((word) => text.includes(word));
}

function numberFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === "string" && /^\d+$/.test(value)) return Math.max(0, Number.parseInt(value, 10));
  }
  return 0;
}

function actionHrefFor(row: TimelineRow) {
  if (row.event_family === "lead" || row.primary_entity_type === "lead") return "/app/leads";
  if (row.event_family === "estimate" || row.primary_entity_type === "estimate") return "/app/service";
  if (row.event_family === "invoice" || row.primary_entity_type === "invoice") return "/app/service";
  if (row.event_family === "review") return "/app/review";
  if (row.event_family === "seo" || row.event_family === "content" || row.event_family === "marketing") return "/app/growth";
  if (row.event_family === "ai") return "/app/ai-workforce";
  if (row.event_family === "billing") return "/app/billing";
  return "/app/operator";
}

function severityFor(row: TimelineRow): OwnerEventInput["severity"] {
  const metadataSeverity = row.metadata_json.severity;
  if (metadataSeverity === "critical" || metadataSeverity === "high" || metadataSeverity === "medium" || metadataSeverity === "low") {
    return metadataSeverity;
  }
  if (textIncludes(row, ["failed", "failure", "error", "dispute", "legal", "safety", "overdue", "critical"])) return "critical";
  if (["billing", "invoice", "revenue", "estimate"].includes(row.event_family)) return "high";
  if (["lead", "follow_up", "review", "system"].includes(row.event_family)) return "medium";
  return "low";
}

function riskTypeFor(row: TimelineRow): OwnerEventInput["riskType"] {
  if (textIncludes(row, ["legal", "contract"])) return "legal";
  if (textIncludes(row, ["safety", "incident"])) return "safety";
  if (textIncludes(row, ["failed", "failure", "error", "webhook", "automation"])) return "automation";
  if (textIncludes(row, ["dispute", "complaint", "angry", "refund"])) return "customer";
  if (["billing", "invoice"].includes(row.event_family)) return "financial";
  if (["revenue", "estimate", "lead"].includes(row.event_family)) return "revenue";
  if (["seo", "content", "marketing", "review"].includes(row.event_family)) return "approval";
  return null;
}

function recommendedActionFor(row: TimelineRow, severity: OwnerEventInput["severity"], moneyCents: number) {
  if (severity === "critical") return "Review this first. Decide whether Ferocity should handle, escalate, or mark it resolved.";
  if (moneyCents > 0) return "Check the money impact, then open the related Ferocity record and move the next step forward.";
  if (row.event_family === "lead") return "Open leads, confirm source and urgency, then prepare the next reply or follow-up.";
  if (row.event_family === "follow_up") return "Review the follow-up queue and close the loop before the customer goes cold.";
  if (row.event_family === "review") return "Use the review workflow to request, respond, or turn proof into marketing content.";
  if (row.event_family === "ai") return "Review what the AI prepared and approve only the changes that are ready.";
  return "Open the related Ferocity area and decide whether this needs owner attention.";
}

function mapTimelineRow(row: TimelineRow): OwnerEventInput | null {
  if (row.event_type === "owner_command_action") return null;

  const severity = severityFor(row);
  const moneyCents = numberFromMetadata(row.metadata_json, ["moneyCents", "revenueCents", "valueCents", "amountCents", "pipelineCents"]);
  const riskType = riskTypeFor(row);
  const ownerAttention =
    severity === "critical" ||
    Boolean(row.metadata_json.ownerAttention) ||
    (severity === "high" && (moneyCents > 0 || riskType === "financial" || riskType === "revenue"));

  const aiHandled = row.event_family === "ai" && textIncludes(row, ["completed", "prepared", "handled"]);
  const summary = row.body?.trim() || "Ferocity recorded activity that may matter to the owner.";

  return {
    platformKey: "ferocity",
    platformName: "Ferocity",
    externalEventId: `timeline:${row.id}`,
    eventType: `timeline.${row.event_family}.${row.event_type}`,
    title: row.title,
    summary,
    severity,
    status: ownerAttention ? "needs_owner" : "watching",
    ownerAttention,
    aiHandled,
    aiSummary: aiHandled ? summary : null,
    recommendedAction: recommendedActionFor(row, severity, moneyCents),
    actionHref: actionHrefFor(row),
    moneyCents,
    riskType,
    confidenceScore: ownerAttention ? 72 : 64,
    metadata: {
      source: "operator_timeline_events",
      timelineEventId: row.id,
      eventFamily: row.event_family,
      primaryEntityType: row.primary_entity_type,
      primaryEntityId: row.primary_entity_id,
      originalMetadata: row.metadata_json
    },
    occurredAt: row.occurred_at
  };
}

export async function syncTimelineToOwnerCommandCenter(tenantId: string) {
  const result = await queryPostgres<TimelineRow>(
    `
    select id, brand_id, event_family, event_type, title, body, primary_entity_type,
      primary_entity_id, metadata_json, occurred_at
    from public.operator_timeline_events
    where tenant_id = $1
      and occurred_at >= now() - interval '30 days'
      and event_type <> 'owner_command_action'
      and (
        event_family in ('lead', 'follow_up', 'estimate', 'invoice', 'revenue', 'billing', 'review', 'ai', 'system')
        or metadata_json ? 'ownerAttention'
        or metadata_json ? 'moneyCents'
        or metadata_json ? 'revenueCents'
        or metadata_json ? 'valueCents'
      )
    order by occurred_at desc
    limit 40
    `,
    [tenantId]
  );

  const mappedEvents = (result?.rows ?? []).map(mapTimelineRow).filter((event): event is OwnerEventInput => Boolean(event));

  let promoted = 0;
  for (const event of mappedEvents) {
    const insertResult = await queryPostgres<{ id: string }>(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
        money_cents, risk_type, confidence_score, metadata_json, occurred_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19)
      on conflict (tenant_id, platform_key, external_event_id)
      do update set
        event_type = excluded.event_type,
        title = excluded.title,
        summary = excluded.summary,
        severity = excluded.severity,
        owner_attention = case
          when public.owner_command_events.status in ('resolved', 'ai_handled') then public.owner_command_events.owner_attention
          else excluded.owner_attention
        end,
        ai_handled = public.owner_command_events.ai_handled or excluded.ai_handled,
        ai_summary = coalesce(public.owner_command_events.ai_summary, excluded.ai_summary),
        recommended_action = excluded.recommended_action,
        action_href = excluded.action_href,
        money_cents = greatest(public.owner_command_events.money_cents, excluded.money_cents),
        risk_type = coalesce(excluded.risk_type, public.owner_command_events.risk_type),
        confidence_score = greatest(public.owner_command_events.confidence_score, excluded.confidence_score),
        metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
        updated_at = now()
      returning id
      `,
      [
        tenantId,
        event.platformKey,
        event.platformName,
        event.externalEventId,
        event.eventType,
        event.title,
        event.summary,
        event.severity,
        event.status,
        event.ownerAttention,
        event.aiHandled,
        event.aiSummary,
        event.recommendedAction,
        event.actionHref,
        event.moneyCents,
        event.riskType,
        event.confidenceScore,
        JSON.stringify(event.metadata),
        event.occurredAt
      ]
    );
    if (insertResult?.rows[0]?.id) promoted += 1;
  }

  return { scanned: result?.rows.length ?? 0, promoted };
}
