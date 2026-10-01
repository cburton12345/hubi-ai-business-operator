"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { assessMessageRetry, requiredRetryCapability } from "@/lib/messaging/message-retry";
import { getMessagingProvider } from "@/lib/messaging/provider-registry";
import { resolveScheduledMessageTime, scheduledMessageModes, scheduledTimeIsAllowed } from "@/lib/messaging/scheduled-message";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const accountSchema = z.string().uuid();
const retrySchema = z.object({
  messageId: z.string().uuid(),
  providerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i)
});
const inboundReplyModeSchema = z.enum(["off", "review", "automatic"]);
const scheduledTextSchema = z.object({
  recipient: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number such as +17155551234."),
  body: z.string().trim().min(1, "Write a message first.").max(1600, "Keep the message under 1,600 characters."),
  providerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  scheduleMode: z.enum(scheduledMessageModes),
  customLocal: z.string().optional()
});
const scheduledTextUpdateSchema = scheduledTextSchema.extend({
  scheduleMode: z.enum([...scheduledMessageModes, "keep"])
});
const scheduledTextIdSchema = z.string().uuid();

export type ScheduledTextActionState = { ok: boolean; message: string };

async function scheduledTextContext(tenantId: string, providerKey: string, recipient: string) {
  const [workspace, provider, permission] = await Promise.all([
    queryPostgres<{ timezone: string }>(
      "select coalesce(timezone,'America/Los_Angeles') as timezone from public.workspace_settings where tenant_id=$1 limit 1",
      [tenantId]
    ),
    queryPostgres<{ id: string }>(`
      select a.id from public.tenant_messaging_accounts a
      join public.messaging_providers p on p.tenant_id=a.tenant_id and p.provider_key=a.provider_key
      where a.tenant_id=$1 and a.provider_key=$2 and p.supports_sms=true
        and a.connection_status in ('active','configured') and a.credentials_status='configured'
        and a.live_sending_enabled=true and a.outbound_enabled=true and a.emergency_paused=false
      limit 1`, [tenantId, providerKey]),
    queryPostgres<{ granted: boolean; suppressed: boolean }>(`
      select
        exists(select 1 from public.contact_consent_records where tenant_id=$1 and channel='sms'
          and lower(contact_value)=lower($2) and status='granted') as granted,
        exists(select 1 from public.contact_suppression_list where tenant_id=$1 and channel='sms'
          and lower(contact_value)=lower($2) and active=true) as suppressed`, [tenantId, recipient])
  ]);
  return {
    timezone: workspace?.rows[0]?.timezone ?? "America/Los_Angeles",
    providerReady: Boolean(provider?.rows[0]),
    consentGranted: Boolean(permission?.rows[0]?.granted),
    suppressed: Boolean(permission?.rows[0]?.suppressed)
  };
}

async function refreshScheduledTexts() {
  revalidatePath("/app/messaging");
  revalidatePath("/app/actions");
}

export async function createScheduledTextAction(
  _previous: ScheduledTextActionState,
  formData: FormData
): Promise<ScheduledTextActionState> {
  await requirePermission("approval:review_low");
  const parsed = scheduledTextSchema.safeParse({
    recipient: formData.get("recipient"), body: formData.get("body"), providerKey: formData.get("providerKey"),
    scheduleMode: formData.get("scheduleMode"), customLocal: formData.get("customLocal")?.toString() || undefined
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the message details." };
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session) return { ok: false, message: "Sign in again before scheduling a message." };
  const context = await scheduledTextContext(tenantId, parsed.data.providerKey, parsed.data.recipient);
  if (!context.providerReady) return { ok: false, message: "Choose a connected SMS provider with live sending enabled." };
  if (context.suppressed) return { ok: false, message: "This recipient has opted out or is suppressed. Ferocity will not schedule the message." };
  if (!context.consentGranted) return { ok: false, message: "SMS consent must be recorded for this recipient before scheduling." };
  const now = new Date();
  const scheduledFor = resolveScheduledMessageTime({
    mode: parsed.data.scheduleMode, customLocal: parsed.data.customLocal, timeZone: context.timezone, now
  });
  if (!scheduledTimeIsAllowed(scheduledFor, now)) {
    return { ok: false, message: "Choose a valid future time within the next year. Times skipped by daylight saving cannot be scheduled." };
  }
  const inserted = await queryPostgres<{ id: string }>(`
    insert into public.outbound_action_queue (
      tenant_id,action_type,provider_key,status,risk_level,target_type,subject,recipient_label,
      scheduled_for,payload_json,policy_id,approved_by_user_id,approved_at,metadata_json
    ) values (
      $1,'sms_send',$2,'approved','medium','scheduled_message','Scheduled text',$3,
      $4,$5::jsonb,(select id from public.live_action_policies where tenant_id=$1 and action_key='sms_send' limit 1),
      $6,now(),$7::jsonb
    ) returning id`, [
      tenantId, parsed.data.providerKey, parsed.data.recipient, scheduledFor!.toISOString(),
      JSON.stringify({ body: parsed.data.body }), session.userId,
      JSON.stringify({ source: "scheduled_message_composer", userScheduled: true, workspaceTimezone: context.timezone,
        scheduleMode: parsed.data.scheduleMode, aiGenerated: false, messagePurpose: "transactional" })
    ]);
  if (!inserted?.rows[0]) return { ok: false, message: "Ferocity could not save this scheduled message." };
  await refreshScheduledTexts();
  const label = parsed.data.scheduleMode === "now" ? "The message is queued to send now." : `Scheduled for ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: context.timezone }).format(scheduledFor!)} (${context.timezone}).`;
  return { ok: true, message: label };
}

export async function updateScheduledTextAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const actionId = scheduledTextIdSchema.safeParse(formData.get("actionId"));
  const parsed = scheduledTextUpdateSchema.safeParse({
    recipient: formData.get("recipient"), body: formData.get("body"), providerKey: formData.get("providerKey"),
    scheduleMode: formData.get("scheduleMode"), customLocal: formData.get("customLocal")?.toString() || undefined
  });
  if (!actionId.success || !parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session) return;
  const context = await scheduledTextContext(tenantId, parsed.data.providerKey, parsed.data.recipient);
  const now = new Date();
  const existing = parsed.data.scheduleMode === "keep"
    ? await queryPostgres<{ scheduled_for: Date }>(
      "select scheduled_for from public.outbound_action_queue where tenant_id=$1 and id=$2 and target_type='scheduled_message' limit 1",
      [tenantId, actionId.data]
    ) : null;
  const scheduledFor = parsed.data.scheduleMode === "keep"
    ? existing?.rows[0]?.scheduled_for ?? null
    : resolveScheduledMessageTime({ mode: parsed.data.scheduleMode, customLocal: parsed.data.customLocal, timeZone: context.timezone, now });
  if (!context.providerReady || !context.consentGranted || context.suppressed || !scheduledTimeIsAllowed(scheduledFor, now)) return;
  await queryPostgres(`
    update public.outbound_action_queue set provider_key=$3,recipient_label=$4,scheduled_for=$5,
      payload_json=jsonb_set(payload_json,'{body}',to_jsonb($6::text),true),status='approved',last_error=null,
      processed_at=null,approved_by_user_id=$7,approved_at=now(),
      metadata_json=metadata_json || $8::jsonb,updated_at=now()
    where tenant_id=$1 and id=$2 and target_type='scheduled_message'
      and status in ('needs_review','approved','queued','failed','blocked')`, [
      tenantId, actionId.data, parsed.data.providerKey, parsed.data.recipient, scheduledFor!.toISOString(), parsed.data.body,
      session.userId, JSON.stringify({ editedAt: now.toISOString(), workspaceTimezone: context.timezone, scheduleMode: parsed.data.scheduleMode })
    ]);
  await refreshScheduledTexts();
}

export async function cancelScheduledTextAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const actionId = scheduledTextIdSchema.safeParse(formData.get("actionId"));
  if (!actionId.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(`update public.outbound_action_queue set status='canceled',processed_at=now(),
    metadata_json=metadata_json || $3::jsonb,updated_at=now()
    where tenant_id=$1 and id=$2 and target_type='scheduled_message'
      and status in ('needs_review','approved','queued','failed','blocked')`, [
    tenantId, actionId.data, JSON.stringify({ canceledAt: new Date().toISOString(), canceledFrom: "scheduled_message_panel" })
  ]);
  await refreshScheduledTexts();
}

export async function updateInboundSmsReplyModeAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const mode = inboundReplyModeSchema.safeParse(formData.get("mode"));
  if (!mode.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(`
    insert into public.live_action_policies (
      tenant_id,action_key,provider_key,label,status,minimum_plan_key,
      requires_consent,requires_human_approval,risk_level,metadata_json
    ) values ($1,'inbound_sms_reply','ferocity_connect','Reply to inbound SMS',$2,'ferocity_connect',true,$3,'medium',$4::jsonb)
    on conflict (tenant_id,action_key) do update set status=excluded.status,
      requires_human_approval=excluded.requires_human_approval,
      metadata_json=public.live_action_policies.metadata_json || excluded.metadata_json,updated_at=now()
  `, [tenantId, mode.data === "off" ? "disabled" : mode.data === "automatic" ? "live" : "review_only",
    mode.data !== "automatic", JSON.stringify({
      selectedMode: mode.data, selectedAt: new Date().toISOString(), ordinaryInboundOnly: true,
      safeguards: ["consent", "suppression", "quiet_hours", "provider_health", "confidence", "risk_escalation"]
    })]);
  revalidatePath("/app/messaging");
}

export async function retryMessageAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = retrySchema.safeParse({
    messageId: formData.get("messageId"),
    providerKey: formData.get("providerKey")
  });
  if (!parsed.success) return;
  const provider = getMessagingProvider(parsed.data.providerKey);
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    conversation_id: string | null;
    channel: "sms" | "mms" | "email" | "manual_sms";
    from_value: string | null;
    to_value: string | null;
    subject: string | null;
    body: string;
    delivery_status: string;
    retry_attempt: number;
  }>(
    `select id, conversation_id, channel, from_value, to_value, subject, body,
            delivery_status, retry_attempt
     from public.messages
     where tenant_id=$1 and id=$2 and direction='outbound'
       and delivery_status in ('failed','rejected','undelivered','suspected_filtered')
     limit 1`,
    [tenantId, parsed.data.messageId]
  );
  const original = result?.rows[0];
  if (!original || !original.to_value) return;

  const manual = parsed.data.providerKey === "manual_sms";
  const requiredCapability = requiredRetryCapability(original.channel);
  const assessment = assessMessageRetry({
    message: {
      body: original.body,
      channel: original.channel,
      deliveryStatus: original.delivery_status,
      retryAttempt: original.retry_attempt
    },
    requestedProviderKey: parsed.data.providerKey,
    providerExists: Boolean(provider),
    providerSupportsCapability: provider?.supportsCapability(requiredCapability) ?? false
  });
  if (!assessment.allowed || !provider) return;
  const idempotencyKey = `message-retry:${original.id}:${crypto.randomUUID()}`;
  await sendMessage({
    tenantId,
    channel: manual ? "manual_sms" : original.channel === "manual_sms" ? "sms" : original.channel,
    to: original.to_value,
    from: original.from_value ?? undefined,
    subject: original.subject ?? undefined,
    body: original.body,
    conversationId: original.conversation_id ?? undefined,
    providerKey: parsed.data.providerKey,
    idempotencyKey,
    authorization: { source: "message_health_manual_retry", humanApproved: true },
    metadata: {
      retryOfMessageId: original.id,
      retryAttempt: original.retry_attempt + 1,
      requestedFrom: "message_health"
    }
  });
  await queryPostgres(
    `update public.messages
     set retry_of_message_id=$3, retry_attempt=$4
     where tenant_id=$1 and idempotency_key=$2`,
    [tenantId, idempotencyKey, original.id, original.retry_attempt + 1]
  );
  revalidatePath("/app/messaging");
  revalidatePath("/app/alerts");
}

export async function emergencyPauseMessagingAccountAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const accountId = accountSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return;
  const tenantId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    update public.tenant_messaging_accounts
    set emergency_paused = true,
        live_sending_enabled = false,
        connection_status = case when ownership_mode = 'manual_assisted' then connection_status else 'paused' end,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      accountId.data,
      JSON.stringify({
        emergencyPausedAt: new Date().toISOString(),
        emergencyPausedFrom: "messaging_page"
      })
    ]
  );
  revalidatePath("/app/messaging");
  revalidatePath("/app/actions");
}

export async function clearMessagingEmergencyPauseAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const accountId = accountSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return;
  const tenantId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    update public.tenant_messaging_accounts
    set emergency_paused = false,
        live_sending_enabled = false,
        connection_status = case
          when ownership_mode = 'manual_assisted' then connection_status
          when credentials_status = 'configured' then 'configured'
          else 'not_connected'
        end,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      accountId.data,
      JSON.stringify({
        emergencyPauseClearedAt: new Date().toISOString(),
        reactivationRequired: true
      })
    ]
  );
  revalidatePath("/app/messaging");
  revalidatePath("/app/actions");
}
