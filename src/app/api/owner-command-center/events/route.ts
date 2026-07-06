import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { triageOwnerEvent } from "@/lib/owner-command-center/triage-owner-event";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";

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

function hasPushWorthySignal(event: z.infer<typeof eventSchema>) {
  if (!event.tenantId) return false;
  if (event.ownerAttention) return true;
  if (event.status === "needs_owner" || event.status === "critical") return true;
  if (event.severity === "high" || event.severity === "critical") return true;
  if (event.moneyCents > 0) return true;
  return Boolean(event.riskType);
}

function ownerNotificationBody(event: z.infer<typeof eventSchema>) {
  const parts = [
    event.platformName,
    event.moneyCents > 0 ? `$${Math.round(event.moneyCents / 100).toLocaleString()} at stake` : null,
    event.recommendedAction ? event.recommendedAction : event.summary
  ].filter(Boolean);

  return parts.join(" - ").slice(0, 180);
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
  if (event.tenantId) {
    const connectionResult = await queryPostgres<{ connection_status: string }>(
      `
      select connection_status
      from public.owner_platform_connections
      where tenant_id = $1 and platform_key = $2
      limit 1
      `,
      [event.tenantId, event.platformKey]
    );
    const connectionStatus = connectionResult?.rows[0]?.connection_status;
    if (connectionStatus === "paused" || connectionStatus === "archived") {
      return NextResponse.json({
        error: "Owner event intake is disconnected for this platform.",
        status: connectionStatus
      }, { status: 409 });
    }
  }

  const triageDecision = event.tenantId
    ? await triageOwnerEvent({
        tenantId: event.tenantId,
        platformKey: event.platformKey,
        platformName: event.platformName,
        eventType: event.eventType,
        title: event.title,
        summary: event.summary,
        severity: event.severity,
        status: event.status,
        ownerAttention: event.ownerAttention,
        aiHandled: event.aiHandled,
        recommendedAction: event.recommendedAction,
        actionHref: event.actionHref,
        moneyCents: event.moneyCents,
        riskType: event.riskType,
        confidenceScore: event.confidenceScore,
        metadata: event.metadata
      })
    : null;

  const effectiveEvent = {
    ...event,
    severity: triageDecision?.severity ?? event.severity,
    status: triageDecision?.status ?? event.status,
    ownerAttention: triageDecision?.ownerAttention ?? event.ownerAttention,
    aiHandled: triageDecision?.aiHandled ?? event.aiHandled,
    aiSummary: triageDecision?.aiSummary ?? event.aiSummary,
    recommendedAction: triageDecision?.recommendedAction ?? event.recommendedAction,
    moneyCents: triageDecision?.moneyCents ?? event.moneyCents,
    riskType: triageDecision?.riskType ?? event.riskType,
    confidenceScore: triageDecision?.confidenceScore ?? event.confidenceScore
  };

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
      effectiveEvent.severity,
      effectiveEvent.status,
      effectiveEvent.ownerAttention,
      effectiveEvent.aiHandled,
      effectiveEvent.aiSummary ?? null,
      effectiveEvent.recommendedAction ?? null,
      event.actionHref ?? null,
      effectiveEvent.moneyCents,
      effectiveEvent.riskType ?? null,
      effectiveEvent.confidenceScore,
      JSON.stringify({
        ...event.metadata,
        intake: "owner_command_center",
        aiTriage: triageDecision
          ? {
              decisionStatus: triageDecision.decisionStatus,
              escalationReasons: triageDecision.escalationReasons,
              makeMoneyNext: triageDecision.makeMoneyNext,
              liveActionAllowed: triageDecision.liveActionAllowed
            }
          : null
      }),
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

  if (event.tenantId && triageDecision) {
    await queryPostgres(
      `
      insert into public.owner_ai_decisions (
        tenant_id, owner_event_id, decision_type, model_provider, model_name, decision_status,
        input_json, output_json, confidence_score, owner_attention, live_action_allowed, escalation_reasons
      )
      values ($1, $2::uuid, 'triage', $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, false, $10::text[])
      `,
      [
        event.tenantId,
        result.rows[0].id,
        process.env.AI_PROVIDER || "openai",
        process.env.AI_MODEL || "gpt-4.1-mini",
        triageDecision.decisionStatus,
        JSON.stringify({
          platformKey: event.platformKey,
          platformName: event.platformName,
          eventType: event.eventType,
          title: event.title,
          summary: event.summary,
          severity: event.severity,
          status: event.status,
          ownerAttention: event.ownerAttention,
          moneyCents: event.moneyCents,
          riskType: event.riskType ?? null,
          confidenceScore: event.confidenceScore,
          metadata: event.metadata
        }),
        JSON.stringify(triageDecision),
        triageDecision.confidenceScore,
        triageDecision.ownerAttention,
        triageDecision.escalationReasons
      ]
    );
  }

  if (event.tenantId) {
    await queryPostgres(
      `
      update public.owner_platform_connections
      set last_event_at = coalesce($3::timestamptz, now()),
          connection_status = case when connection_status = 'planned' then 'connected' else connection_status end,
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and platform_key = $2
      `,
      [
        event.tenantId,
        event.platformKey,
        event.occurredAt ?? null,
        JSON.stringify({
          lastExternalEventId: event.externalEventId ?? null,
          lastEventType: event.eventType,
          lastIntakeAt: new Date().toISOString()
        })
      ]
    );
  }

  if (hasPushWorthySignal(effectiveEvent)) {
    const preferences = await getPushNotificationPreferences(event.tenantId!);
    const preferencesAllowPush = pushPreferencesAllowEvent({
      preferences,
      severity: effectiveEvent.severity,
      status: effectiveEvent.status,
      ownerAttention: effectiveEvent.ownerAttention,
      moneyCents: effectiveEvent.moneyCents,
      riskType: effectiveEvent.riskType ?? null
    });

    if (!preferencesAllowPush) {
      return NextResponse.json({ ok: true, id: result.rows[0].id, push: "filtered_by_preferences" });
    }

    const pushResult = await sendWorkspacePushNotifications({
      tenantId: event.tenantId!,
      eventType: `owner.${event.eventType}`,
      title: event.title,
      body: ownerNotificationBody(effectiveEvent),
      url: event.actionHref ?? "/app/owner-command-center",
      tag: `owner-${event.platformKey}-${event.eventType}`,
      metadata: {
        ownerEventId: result.rows[0].id,
        platformKey: event.platformKey,
        platformName: event.platformName,
        severity: effectiveEvent.severity,
        status: effectiveEvent.status,
        riskType: effectiveEvent.riskType ?? null,
        moneyCents: effectiveEvent.moneyCents
      }
    });

    if (pushResult.failed > 0 || pushResult.missing.length > 0) {
      await logAppError({
        source: "api.owner-command-center.events.push",
        message: "Owner event push notification did not fully send.",
        severity: pushResult.missing.length > 0 ? "info" : "warning",
        metadata: {
          ownerEventId: result.rows[0].id,
          platformKey: event.platformKey,
          sent: pushResult.sent,
          failed: pushResult.failed,
          skipped: pushResult.skipped,
          missing: pushResult.missing
        }
      });
    }
  }

  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
