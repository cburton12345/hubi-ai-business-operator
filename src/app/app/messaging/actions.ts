"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { assessMessageRetry, requiredRetryCapability } from "@/lib/messaging/message-retry";
import { getMessagingProvider } from "@/lib/messaging/provider-registry";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const accountSchema = z.string().uuid();
const retrySchema = z.object({
  messageId: z.string().uuid(),
  providerKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i)
});
const inboundReplyModeSchema = z.enum(["off", "review", "automatic"]);

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
