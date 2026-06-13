import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";

const eventSchema = z.object({
  tenantId: z.string().uuid().optional(),
  platformKey: z.string().trim().min(1).max(80),
  platformName: z.string().trim().min(1).max(120),
  externalEventId: z.string().trim().max(180).optional(),
  eventType: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(220),
  summary: z.string().trim().min(1).max(1200),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
  status: z.enum(["open", "needs_owner", "critical", "ai_handled", "watching", "resolved", "archived"]).default("open"),
  ownerAttention: z.boolean().default(false),
  aiHandled: z.boolean().default(false),
  aiSummary: z.string().trim().max(1200).optional(),
  recommendedAction: z.string().trim().max(1200).optional(),
  actionHref: z.string().trim().max(500).optional(),
  moneyCents: z.number().int().nonnegative().default(0),
  riskType: z.enum(["revenue", "financial", "customer", "legal", "safety", "automation", "low_confidence", "approval"]).optional(),
  confidenceScore: z.number().int().min(0).max(100).default(80),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-ferocity-owner-event-token")?.trim() ?? "";
}

export async function POST(request: Request) {
  const expectedToken = env.OWNER_COMMAND_CENTER_TOKEN;
  if (!expectedToken || bearerToken(request) !== expectedToken) {
    return NextResponse.json({ error: "Owner event intake is not configured or token is invalid." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid owner event payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const event = parsed.data;
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
      action_href, money_cents, risk_type, confidence_score, metadata_json, occurred_at
    )
    values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()))
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
    set event_type = excluded.event_type,
        title = excluded.title,
        summary = excluded.summary,
        severity = excluded.severity,
        status = excluded.status,
        owner_attention = excluded.owner_attention,
        ai_handled = excluded.ai_handled,
        ai_summary = excluded.ai_summary,
        recommended_action = excluded.recommended_action,
        action_href = excluded.action_href,
        money_cents = excluded.money_cents,
        risk_type = excluded.risk_type,
        confidence_score = excluded.confidence_score,
        metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
        occurred_at = excluded.occurred_at,
        updated_at = now()
    returning id
    `,
    [
      event.tenantId ?? null,
      event.platformKey,
      event.platformName,
      event.externalEventId ?? null,
      event.eventType,
      event.title,
      event.summary,
      event.severity,
      event.status,
      event.ownerAttention,
      event.aiHandled,
      event.aiSummary ?? null,
      event.recommendedAction ?? null,
      event.actionHref ?? null,
      event.moneyCents,
      event.riskType ?? null,
      event.confidenceScore,
      JSON.stringify({ ...event.metadata, intake: "owner_command_center" }),
      event.occurredAt ?? null
    ]
  );

  if (!result?.rows[0]?.id) {
    await logAppError({
      source: "api.owner-command-center.events",
      message: "Owner event intake failed to write event.",
      severity: "warning",
      metadata: { platformKey: event.platformKey, externalEventId: event.externalEventId }
    });
    return NextResponse.json({ error: "Event was not saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
