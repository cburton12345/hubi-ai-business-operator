import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { triageOwnerEvent } from "@/lib/owner-command-center/triage-owner-event";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { captureH4rGoalObservation } from "@/lib/integrations/h4r/goal-observation";
import { captureIntegrationGoalObservation } from "@/lib/integrations/goal-observation";
import { timingSafeSecretMatch } from "@/lib/security/rotating-secret";
import {
  ownerEventSchema,
  OwnerEventRequestError,
  readBoundedJson,
  type OwnerEventInput,
} from "@/lib/owner-command-center/owner-event-intake";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-ferocity-owner-event-token")?.trim() ?? "";
}

type OwnerPushSignal = Pick<
  OwnerEventInput,
  "platformName" | "severity" | "status" | "ownerAttention" | "moneyCents" | "summary"
> & {
  recommendedAction?: string | null;
  riskType?: OwnerEventInput["riskType"] | null;
};

function hasPushWorthySignal(event: OwnerPushSignal) {
  if (event.ownerAttention) return true;
  if (event.status === "needs_owner" || event.status === "critical") return true;
  if (event.severity === "high" || event.severity === "critical") return true;
  if (event.moneyCents > 0) return true;
  return Boolean(event.riskType);
}

function ownerNotificationBody(event: OwnerPushSignal) {
  const parts = [
    event.platformName,
    event.moneyCents > 0 ? `$${Math.round(event.moneyCents / 100).toLocaleString()} at stake` : null,
    event.recommendedAction ? event.recommendedAction : event.summary
  ].filter(Boolean);

  return parts.join(" - ").slice(0, 180);
}

export async function POST(request: Request) {
  if (!timingSafeSecretMatch(bearerToken(request), env.OWNER_COMMAND_CENTER_TOKEN, env.OWNER_COMMAND_CENTER_TOKEN_PREVIOUS)) {
    return NextResponse.json({ error: "Owner event intake is not configured or token is invalid." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await readBoundedJson(request);
  } catch (error) {
    const status = error instanceof OwnerEventRequestError ? error.statusCode : 400;
    const message = error instanceof OwnerEventRequestError ? error.message : "Invalid JSON payload.";
    return NextResponse.json({ error: message }, { status });
  }

  const parsed = ownerEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid owner event payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const event = parsed.data;
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

  const existing = await queryPostgres<{ id: string }>(
    `select id from public.owner_command_events
     where tenant_id = $1 and platform_key = $2 and external_event_id = $3
     limit 1`,
    [event.tenantId, event.platformKey, event.externalEventId],
  );
  if (existing?.rows[0]?.id) {
    return NextResponse.json({ ok: true, id: existing.rows[0].id, duplicate: true, push: "not_repeated" });
  }

  const triageDecision = await triageOwnerEvent({
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
  });

  const effectiveEvent = {
    ...event,
    severity: triageDecision.severity,
    status: triageDecision.status,
    ownerAttention: triageDecision.ownerAttention,
    aiHandled: triageDecision.aiHandled,
    aiSummary: triageDecision.aiSummary,
    recommendedAction: triageDecision.recommendedAction,
    moneyCents: triageDecision.moneyCents,
    riskType: triageDecision.riskType,
    confidenceScore: triageDecision.confidenceScore
  };

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
      action_href, money_cents, risk_type, confidence_score, metadata_json, occurred_at
    )
    values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()))
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing
    returning id
    `,
    [
      event.tenantId,
      event.platformKey,
      event.platformName,
      event.externalEventId,
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
        aiTriage: {
          decisionStatus: triageDecision.decisionStatus,
          escalationReasons: triageDecision.escalationReasons,
          makeMoneyNext: triageDecision.makeMoneyNext,
          liveActionAllowed: triageDecision.liveActionAllowed
        }
      }),
      event.occurredAt ?? null
    ]
  );

  if (!result?.rows[0]?.id) {
    const concurrentDuplicate = await queryPostgres<{ id: string }>(
      `select id from public.owner_command_events
       where tenant_id = $1 and platform_key = $2 and external_event_id = $3
       limit 1`,
      [event.tenantId, event.platformKey, event.externalEventId],
    );
    if (concurrentDuplicate?.rows[0]?.id) {
      return NextResponse.json({ ok: true, id: concurrentDuplicate.rows[0].id, duplicate: true, push: "not_repeated" });
    }
    await logAppError({
      source: "api.owner-command-center.events",
      message: "Owner event intake failed to write event.",
      severity: "warning",
      metadata: { platformKey: event.platformKey, externalEventId: event.externalEventId }
    });
    return NextResponse.json({ error: "Event was not saved." }, { status: 500 });
  }

  try {
    const goalEvent = {
      tenantId: event.tenantId,
      ownerEventId: result.rows[0].id,
      externalEventId: event.externalEventId,
      eventType: event.eventType,
      title: event.title,
      summary: event.summary,
      severity: effectiveEvent.severity,
      status: effectiveEvent.status,
      ownerAttention: effectiveEvent.ownerAttention,
      occurredAt: event.occurredAt,
      riskType: effectiveEvent.riskType,
      moneyCents: effectiveEvent.moneyCents,
      recommendedAction: effectiveEvent.recommendedAction,
      metadata: event.metadata,
    };
    if (event.platformKey === "h4r") {
      await captureH4rGoalObservation(goalEvent);
    } else {
      await captureIntegrationGoalObservation({
        ...goalEvent,
        platformKey: event.platformKey,
        platformName: event.platformName,
      });
    }
  } catch (error) {
    await logAppError({
      tenantId: event.tenantId,
      source: "api.owner-command-center.events.integration-goal",
      message: error instanceof Error ? error.message : "Integration goal observation failed.",
      severity: "warning",
      retryable: true,
      metadata: {
        ownerEventId: result.rows[0].id,
        externalEventId: event.externalEventId,
      },
    });
  }

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
          lastExternalEventId: event.externalEventId,
          lastEventType: event.eventType,
          lastIntakeAt: new Date().toISOString()
        })
      ]
  );

  if (hasPushWorthySignal(effectiveEvent)) {
    const preferences = await getPushNotificationPreferences(event.tenantId);
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
      tenantId: event.tenantId,
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
