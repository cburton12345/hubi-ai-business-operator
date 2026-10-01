import { NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { claimH4rBridgeNonce, verifyH4rSignedRequest } from "@/lib/integrations/h4r/request-auth";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});

type Mapping = {
  ferocity_tenant_id: string;
  status: "shadow" | "review" | "active" | "paused";
  reply_mode: "record_only" | "review" | "guarded_automatic";
};

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyH4rSignedRequest(request, rawBody);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (!(await claimH4rBridgeNonce(verified.nonce))) {
    return NextResponse.json({ ok: false, error: "Duplicate bridge nonce." }, { status: 409 });
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid H4R status request." }, { status: 400 });

  const mappingResult = await queryPostgres<Mapping>(
    `select ferocity_tenant_id,status,reply_mode
     from public.h4r_ferocity_bridge_workspaces
     where h4r_workspace_id=$1 and status in ('shadow','review','active','paused')
     limit 1`,
    [parsed.data.workspace_id]
  );
  const mapping = mappingResult?.rows[0];
  if (!mapping) return NextResponse.json({ ok: false, error: "H4R workspace is not authorized for bridge status." }, { status: 403 });

  const tenantId = mapping.ferocity_tenant_id;
  const limit = parsed.data.limit;
  const [deviceResult, accountResult, alertResult, outboundResult, inboundResult, draftResult] = await Promise.all([
    queryPostgres<{
      id: string; display_name: string; status: string; app_version: string | null; battery_percent: number | null;
      charging: boolean | null; network_type: string | null; last_heartbeat_at: Date | null; last_success_at: Date | null;
      consecutive_failures: number; updated_at: Date;
    }>(
      `select id,display_name,status,app_version,battery_percent,charging,network_type,
              last_heartbeat_at,last_success_at,consecutive_failures,updated_at
       from public.ferocity_connect_devices
       where tenant_id=$1 and status<>'revoked'
       order by coalesce(last_heartbeat_at,updated_at) desc limit 10`,
      [tenantId]
    ),
    queryPostgres<{
      connection_status: string; credentials_status: string; live_sending_enabled: boolean;
      outbound_enabled: boolean; emergency_paused: boolean; hourly_send_cap: number | null;
      daily_send_cap: number | null; per_recipient_hourly_cap: number | null; updated_at: Date;
    }>(
      `select connection_status,credentials_status,live_sending_enabled,outbound_enabled,emergency_paused,
              hourly_send_cap,daily_send_cap,per_recipient_hourly_cap,updated_at
       from public.tenant_messaging_accounts
       where tenant_id=$1 and provider_key='ferocity_connect'
       order by updated_at desc limit 1`,
      [tenantId]
    ),
    queryPostgres<{
      alert_key: string; severity: string; title: string; summary: string; first_seen_at: Date; last_seen_at: Date;
    }>(
      `select alert_key,severity,title,summary,first_seen_at,last_seen_at
       from public.operator_alerts
       where tenant_id=$1 and status='active'
         and (alert_key like 'ferocity-connect:%' or alert_key like 'h4r-callback:%')
       order by last_seen_at desc limit 25`,
      [tenantId]
    ),
    queryPostgres<{
      id: string; message_id: string | null; recipient: string; body: string; status: string;
      attempt_count: number; last_error_code: string | null; last_error_safe: string | null;
      created_at: Date; updated_at: Date; sent_at: Date | null; delivered_at: Date | null; metadata_json: Record<string, unknown>;
    }>(
      `select id,message_id,recipient,body,status,attempt_count,last_error_code,last_error_safe,
              created_at,updated_at,sent_at,delivered_at,metadata_json
       from public.ferocity_connect_jobs
       where tenant_id=$1 and metadata_json->>'source'='h4r'
         and metadata_json->>'h4rWorkspaceId'=$2
       order by created_at desc limit $3`,
      [tenantId, parsed.data.workspace_id, limit]
    ),
    queryPostgres<{
      id: string; conversation_id: string | null; provider_message_ref: string | null; from_value: string | null;
      to_value: string | null; body: string; status: string; received_at: Date | null; created_at: Date;
      metadata_json: Record<string, unknown>;
    }>(
      `select id,conversation_id,provider_message_ref,from_value,to_value,body,status,received_at,created_at,metadata_json
       from public.messages
       where tenant_id=$1 and direction='inbound' and provider_key='ferocity_connect'
         and metadata_json->>'source'='h4r' and metadata_json->>'h4rWorkspaceId'=$2
       order by coalesce(received_at,created_at) desc limit $3`,
      [tenantId, parsed.data.workspace_id, limit]
    ),
    queryPostgres<{
      id: string; target_id: string | null; recipient_label: string | null; payload_json: Record<string, unknown>;
      status: string; risk_level: string; metadata_json: Record<string, unknown>; created_at: Date; updated_at: Date;
    }>(
      `select q.id,q.target_id,q.recipient_label,q.payload_json,q.status,q.risk_level,q.metadata_json,q.created_at,q.updated_at
       from public.outbound_action_queue q
       where q.tenant_id=$1 and q.action_type='sms_send'
         and q.metadata_json->>'source'='inbound_reply_draft'
         and exists (
           select 1 from public.messages m
           where m.tenant_id=q.tenant_id and m.source_message_id=q.metadata_json->>'inboundMessageId'
             and m.metadata_json->>'source'='h4r' and m.metadata_json->>'h4rWorkspaceId'=$2
         )
       order by q.created_at desc limit $3`,
      [tenantId, parsed.data.workspace_id, limit]
    ),
  ]);

  const devices = deviceResult?.rows ?? [];
  const account = accountResult?.rows[0] ?? null;
  const freshestHeartbeat = devices.reduce<Date | null>((latest, device) => {
    if (!device.last_heartbeat_at) return latest;
    return !latest || device.last_heartbeat_at > latest ? device.last_heartbeat_at : latest;
  }, null);
  const offline = devices.length === 0 || !freshestHeartbeat || Date.now() - freshestHeartbeat.getTime() > 10 * 60 * 1000;
  const paused = mapping.status === "paused" || Boolean(account?.emergency_paused);
  const degraded = paused || offline || !account?.outbound_enabled || !account?.live_sending_enabled
    || devices.some((device) => device.status === "needs_attention" || device.consecutive_failures > 0);

  return NextResponse.json({
    ok: true,
    mode: "read_only",
    workspace_id: parsed.data.workspace_id,
    bridge: { status: mapping.status, reply_mode: mapping.reply_mode, live_sending_authorized: mapping.status === "active" },
    provider_health: {
      status: paused ? "paused" : offline ? "offline" : degraded ? "degraded" : "healthy",
      checked_at: new Date().toISOString(),
      account: account ? {
        connection_status: account.connection_status,
        credentials_status: account.credentials_status,
        live_sending_enabled: account.live_sending_enabled,
        outbound_enabled: account.outbound_enabled,
        emergency_paused: account.emergency_paused,
        hourly_send_cap: account.hourly_send_cap,
        daily_send_cap: account.daily_send_cap,
        per_recipient_hourly_cap: account.per_recipient_hourly_cap,
        updated_at: iso(account.updated_at),
      } : null,
      devices: devices.map((device) => ({
        id: device.id,
        display_name: device.display_name,
        status: device.status,
        app_version: device.app_version,
        battery_percent: device.battery_percent,
        charging: device.charging,
        network_type: device.network_type,
        last_heartbeat_at: iso(device.last_heartbeat_at),
        last_success_at: iso(device.last_success_at),
        consecutive_failures: device.consecutive_failures,
      })),
      active_alerts: (alertResult?.rows ?? []).map((alert) => ({
        key: alert.alert_key, severity: alert.severity, title: alert.title, summary: alert.summary,
        first_seen_at: iso(alert.first_seen_at), last_seen_at: iso(alert.last_seen_at),
      })),
    },
    outbound_messages: (outboundResult?.rows ?? []).map((message) => ({
      ferocity_message_ref: message.id,
      h4r_sms_outbox_id: message.metadata_json?.h4rSmsOutboxId ?? null,
      h4r_conversation_id: message.metadata_json?.h4rConversationId ?? null,
      h4r_prospect_id: message.metadata_json?.h4rProspectId ?? null,
      to: message.recipient,
      body: message.body,
      status: message.status,
      attempt_count: message.attempt_count,
      error_code: message.last_error_code,
      safe_error: message.last_error_safe,
      created_at: iso(message.created_at),
      updated_at: iso(message.updated_at),
      sent_at: iso(message.sent_at),
      delivered_at: iso(message.delivered_at),
    })),
    inbound_messages: (inboundResult?.rows ?? []).map((message) => ({
      ferocity_message_ref: message.id,
      provider_message_ref: message.provider_message_ref,
      h4r_conversation_id: message.metadata_json?.h4rConversationId ?? null,
      h4r_prospect_id: message.metadata_json?.h4rProspectId ?? null,
      from: message.from_value,
      to: message.to_value,
      body: message.body,
      status: message.status,
      occurred_at: iso(message.received_at ?? message.created_at),
    })),
    prepared_replies: (draftResult?.rows ?? []).map((draft) => ({
      id: draft.id,
      conversation_id: draft.target_id,
      recipient: draft.recipient_label,
      body: draft.payload_json?.body ?? "",
      status: draft.status,
      risk_level: draft.risk_level,
      confidence: draft.metadata_json?.confidence ?? null,
      requires_human: draft.metadata_json?.requiresHuman !== false,
      reason: draft.metadata_json?.reason ?? null,
      created_at: iso(draft.created_at),
      updated_at: iso(draft.updated_at),
    })),
  });
}
