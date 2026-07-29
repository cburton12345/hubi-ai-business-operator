"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { scanActionQueueForTenant } from "@/lib/actions-queue/scan-action-queue";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import {
  automaticCommunicationRequiresConsent,
  communicationApprovalLevels,
  communicationExecutionModes,
  communicationFallbackModes,
  communicationLanguageModes,
  communicationMethods,
  communicationProviderPreferences,
  communicationRoute,
  type CommunicationMethod
} from "@/lib/preferences/communication-preferences";
import { recordPreferenceAuditEvent, saveScopedPreference, type SavedPreferenceScopeType } from "@/lib/preferences/saved-preferences";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getContactCommunicationPreference } from "@/lib/preferences/contact-communication-preferences";

const queueStatusSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["needs_review", "approved", "queued", "sent_manually", "failed", "canceled", "blocked"]),
  note: z.string().optional()
});

const serviceForActionType: Record<string, string> = {
  sms_send: "sms_send",
  email_send: "email_send",
  publish_content: "publishing_queue",
  calendar_sync: "calendar_sync",
  review_request: "review_requests",
  billing_sync: "growth_attribution"
};

export type CommunicationMethodActionState = {
  ok: boolean;
  message: string;
  method?: CommunicationMethod;
};

const communicationMethodSchema = z.object({
  actionId: z.string().uuid(),
  method: z.enum(communicationMethods),
  saveScope: z.enum(["one_time", "workflow", "contact", "user", "organization"]),
  executionMode: z.enum(communicationExecutionModes).optional(),
  providerPreference: z.enum(communicationProviderPreferences).optional(),
  approvalLevel: z.enum(communicationApprovalLevels).optional(),
  languageMode: z.enum(communicationLanguageModes).optional(),
  fallbackMode: z.enum(communicationFallbackModes).optional(),
  fallbackMethod: z.enum(communicationMethods).optional()
});

export async function updateCommunicationMethodAction(
  _previous: CommunicationMethodActionState,
  formData: FormData
): Promise<CommunicationMethodActionState> {
  await requirePermission("ai:queue");
  const parsed = communicationMethodSchema.safeParse({
    actionId: formData.get("actionId"),
    method: formData.get("method"),
    saveScope: formData.get("saveScope"),
    executionMode: formData.get("executionMode") || undefined,
    providerPreference: formData.get("providerPreference") || undefined,
    approvalLevel: formData.get("approvalLevel") || undefined,
    languageMode: formData.get("languageMode") || undefined,
    fallbackMode: formData.get("fallbackMode") || undefined,
    fallbackMethod: formData.get("fallbackMethod") || undefined
  });
  if (!parsed.success) return { ok: false, message: "Choose a valid communication method and save option." };

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session) return { ok: false, message: "Sign in again before changing this preference." };
  if (parsed.data.saveScope === "organization") await requirePermission("tenant:manage");

  const result = await queryPostgres<{
    id: string;
    action_type: string;
    provider_key: string;
    status: string;
    recipient_label: string | null;
    workflow_key: string;
    phone: string | null;
    email: string | null;
    contact_key: string | null;
    is_marketing: boolean;
  }>(
    `
    select
      q.id,
      q.action_type,
      q.provider_key,
      q.status,
      q.recipient_label,
      lower(coalesce(
        nullif(q.metadata_json->>'workflowKey', ''),
        nullif(q.metadata_json->>'queueType', ''),
        q.action_type
      )) as workflow_key,
      coalesce(
        l.phone,
        invoice_customer.phone,
        case when coalesce(q.recipient_label, '') not like '%@%' then q.recipient_label end
      ) as phone,
      coalesce(
        l.email,
        invoice_customer.email,
        case when coalesce(q.recipient_label, '') like '%@%' then q.recipient_label end
      ) as email,
      case
        when q.target_type = 'lead' and l.id is not null then 'lead:' || l.id::text
        when invoice_customer.id is not null then 'customer:' || invoice_customer.id::text
        else lower(nullif(q.recipient_label, ''))
      end as contact_key,
      coalesce((q.metadata_json->>'marketing')::boolean, false) as is_marketing
    from public.outbound_action_queue q
    left join public.leads l
      on l.tenant_id = q.tenant_id
      and l.id = q.target_id
      and q.target_type = 'lead'
    left join public.service_invoices invoice
      on invoice.tenant_id = q.tenant_id
      and invoice.id = q.target_id
      and q.target_type = 'service_invoice'
    left join public.customers invoice_customer
      on invoice_customer.tenant_id = invoice.tenant_id
      and invoice_customer.id = invoice.customer_id
    where q.tenant_id = $1 and q.id = $2
    limit 1
    `,
    [workspaceId, parsed.data.actionId]
  );
  const row = result?.rows[0];
  if (!row) return { ok: false, message: "That queued action is no longer available." };

  const method = parsed.data.method;
  const preference = {
    method,
    executionMode: parsed.data.executionMode,
    providerPreference: parsed.data.providerPreference,
    approvalLevel: parsed.data.approvalLevel,
    languageMode: parsed.data.languageMode,
    fallbackMode: parsed.data.fallbackMode,
    fallbackMethods: parsed.data.fallbackMethod ? [parsed.data.fallbackMethod] : undefined
  };
  const route = communicationRoute(method);
  if (row.contact_key) {
    const contactPreference = await getContactCommunicationPreference(workspaceId, row.contact_key);
    if (method === "ai_voice_call" && contactPreference.noAiCalls) {
      await recordPreferenceAuditEvent({
        tenantId: workspaceId, domain: "communication", key: "delivery_method",
        eventType: "blocked_by_policy", value: preference, userId: session.userId,
        context: { actionId: row.id, reason: "contact_disallows_ai_calls" }
      });
      return { ok: false, message: "This contact does not allow AI calls. Choose a human call or another method." };
    }
    if (method === "automatic_sms" && row.is_marketing && contactPreference.noMarketingTexts) {
      await recordPreferenceAuditEvent({
        tenantId: workspaceId, domain: "communication", key: "delivery_method",
        eventType: "blocked_by_policy", value: preference, userId: session.userId,
        context: { actionId: row.id, reason: "contact_disallows_marketing_texts" }
      });
      return { ok: false, message: "This contact does not allow marketing texts. Choose a permitted method." };
    }
  }
  const needsPhone = ["automatic_sms", "native_sms", "google_voice", "ai_voice_call", "human_call"].includes(method);
  if (needsPhone && !row.phone) return { ok: false, message: "Add a phone number before choosing this method." };
  if (method === "email" && !row.email) return { ok: false, message: "Add an email address before choosing email." };

  let providerKey = route.providerKey;
  if (!providerKey && route.actionType === "voice_call") {
    const voiceRoute = await queryPostgres<{ primary_provider_key: string }>(
      `
      select primary_provider_key
      from public.voice_provider_routes
      where tenant_id = $1 and route_family = 'voice_orchestrator'
      limit 1
      `,
      [workspaceId]
    );
    providerKey = voiceRoute?.rows[0]?.primary_provider_key ?? null;
  } else if (!providerKey) {
    const providerRoute = await queryPostgres<{ default_provider_key: string }>(
      `
      select default_provider_key
      from public.provider_routing_rules
      where tenant_id = $1 and action_type = $2 and status = 'active'
      order by updated_at desc
      limit 1
      `,
      [workspaceId, route.actionType]
    );
    providerKey = providerRoute?.rows[0]?.default_provider_key ?? null;
  }
  if (!providerKey) {
    return {
      ok: false,
      message: `Connect or choose a provider for ${route.actionType.replaceAll("_", " ")} before using this method.`
    };
  }

  const recipient = method === "email"
    ? row.email
    : needsPhone
      ? row.phone
      : row.recipient_label;
  const complianceChannel = method === "email"
    ? "email"
    : ["ai_voice_call", "human_call"].includes(method)
      ? "phone"
      : ["automatic_sms", "native_sms", "google_voice"].includes(method)
        ? "sms"
        : null;
  if (complianceChannel && recipient) {
    const compliance = await queryPostgres<{ consent_granted: boolean; suppressed: boolean }>(
      `
      select
        (
          exists (
            select 1 from public.contact_consent_records
            where tenant_id = $1 and channel = $2
              and lower(contact_value) = lower($3) and status = 'granted'
          )
          or exists (
            select 1 from public.messaging_consents
            where tenant_id = $1 and contact_channel = $2
              and lower(contact_value) = lower($3) and status = 'granted'
          )
        ) as consent_granted,
        (
          exists (
            select 1 from public.contact_suppression_list
            where tenant_id = $1 and channel = $2
              and lower(contact_value) = lower($3) and active = true
          )
          or exists (
            select 1 from public.messaging_opt_outs
            where tenant_id = $1 and contact_channel = $2
              and lower(contact_value) = lower($3) and active = true
          )
        ) as suppressed
      `,
      [workspaceId, complianceChannel, recipient]
    );
    const rule = compliance?.rows[0];
    if (rule?.suppressed) {
      await recordPreferenceAuditEvent({
        tenantId: workspaceId, domain: "communication", key: "delivery_method",
        eventType: "blocked_by_policy", value: preference, userId: session.userId,
        context: { actionId: row.id, reason: "suppressed", channel: complianceChannel }
      });
      return { ok: false, message: `${complianceChannel.toUpperCase()} is blocked because this contact opted out or is suppressed.` };
    }
    if (automaticCommunicationRequiresConsent(method) && !rule?.consent_granted) {
      await recordPreferenceAuditEvent({
        tenantId: workspaceId, domain: "communication", key: "delivery_method",
        eventType: "blocked_by_policy", value: preference, userId: session.userId,
        context: { actionId: row.id, reason: "missing_consent", channel: complianceChannel }
      });
      return { ok: false, message: `${complianceChannel.toUpperCase()} consent is required before this automated method can be selected.` };
    }
  }

  if (parsed.data.saveScope !== "one_time") {
    const scopeMap: Record<Exclude<typeof parsed.data.saveScope, "one_time">, { type: SavedPreferenceScopeType; key: string | null }> = {
      workflow: { type: "workflow", key: row.workflow_key },
      contact: { type: "contact", key: row.contact_key },
      user: { type: "user", key: session.userId },
      organization: { type: "organization", key: "default" }
    };
    const scope = scopeMap[parsed.data.saveScope];
    if (!scope.key) return { ok: false, message: "This action does not have a contact to save a preference for." };
    await saveScopedPreference({
      tenantId: workspaceId,
      domain: "communication",
      key: "delivery_method",
      scope: { type: scope.type, key: scope.key },
      value: preference,
      userId: session.userId,
      metadata: {
        changedInline: true,
        sourceActionId: row.id,
        workflowKey: row.workflow_key
      }
    });
  } else {
    await recordPreferenceAuditEvent({
      tenantId: workspaceId,
      domain: "communication",
      key: "delivery_method",
      eventType: "one_time_override",
      value: preference,
      source: "one_time",
      userId: session.userId,
      context: { actionId: row.id, workflowKey: row.workflow_key }
    });
  }

  await queryPostgres(
    `
    update public.outbound_action_queue
    set action_type = $3,
        provider_key = $4,
        recipient_label = coalesce($5, recipient_label),
        status = case when $6 = 'skip' then 'canceled' else 'needs_review' end,
        last_error = null,
        metadata_json = metadata_json || $7::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      row.id,
      route.actionType,
      providerKey,
      recipient,
      method,
      JSON.stringify({
        communicationMethod: method,
        communicationPreference: preference,
        communicationMethodScope: parsed.data.saveScope,
        communicationMethodChangedAt: new Date().toISOString(),
        communicationMethodChangedBy: session.userId,
        voiceMessagingEmailIndependent: true
      })
    ]
  );

  revalidatePath("/app/actions");
  revalidatePath("/app/text-queue");
  return {
    ok: true,
    method,
    message: parsed.data.saveScope === "one_time"
      ? "Method changed for this action."
      : `Method changed and remembered for ${parsed.data.saveScope.replace("_", " ")}.`
  };
}

async function logDelivery(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  eventType: string;
  status?: string;
  providerEventId?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.outbound_delivery_events (
      tenant_id, queue_id, provider_key, event_type, status, provider_event_id, message, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.tenantId,
      input.queueId,
      input.providerKey,
      input.eventType,
      input.status ?? "logged",
      input.providerEventId ?? null,
      input.message ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

async function logProviderUsage(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  actionType: string;
  billingStatus: "included" | "billable" | "blocked" | "manual";
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.provider_usage_events (
      tenant_id, provider_account_id, provider_key, action_type, unit_count, billing_status, source_queue_id, metadata_json
    )
    select $1, pa.id, $3, $4, 1, $5, $2, $6::jsonb
    from (select 1) seed
    left join public.provider_accounts pa on pa.tenant_id = $1 and pa.provider_key = $3
    `,
    [
      input.tenantId,
      input.queueId,
      input.providerKey,
      input.actionType,
      input.billingStatus,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  await queryPostgres(
    `
    update public.provider_accounts
    set monthly_used_units = monthly_used_units + 1,
        updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [input.tenantId, input.providerKey]
  );
}

export async function scanActionQueueAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  await scanActionQueueForTenant(workspaceId);
  revalidatePath("/app/actions");
  revalidatePath("/app/automation-command");
  revalidatePath("/app/owner-command-center");
}

export async function sendApprovedEmailAction(formData: FormData) {
  await requirePermission("approval:review_high");
  const parsed = z.object({ actionId: z.string().uuid() }).safeParse({
    actionId: formData.get("actionId")
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const gate = await getServiceGate(workspaceId, "email_send");
  if (!gate.enabled) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = $3,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2 and action_type = 'email_send'
      `,
      [
        workspaceId,
        parsed.data.actionId,
        gate.reason,
        JSON.stringify({
          blockedByServiceControl: "email_send",
          mode: gate.mode,
          currentUsage: gate.currentUsage,
          usageLimit: gate.usageLimit
        })
      ]
    );
    revalidatePath("/app/actions");
    return;
  }

  const result = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string | null;
    provider_key: string;
    status: string;
    subject: string | null;
    recipient_label: string | null;
    payload_body: string | null;
    target_id: string | null;
    message_body: string | null;
    message_recipient: string | null;
    thread_subject: string | null;
    lead_email: string | null;
    customer_email: string | null;
    retry_count: number;
  }>(
    `
    select
      q.id,
      q.tenant_id,
      q.brand_id,
      q.provider_key,
      q.status,
      q.subject,
      q.recipient_label,
      q.payload_json->>'body' as payload_body,
      q.target_id,
      m.body as message_body,
      m.recipient_label as message_recipient,
      t.subject as thread_subject,
      l.email as lead_email,
      c.email as customer_email,
      coalesce((q.metadata_json->>'retryCount')::int, 0) as retry_count
    from public.outbound_action_queue q
    left join public.communication_messages m on m.tenant_id = q.tenant_id and m.id = q.target_id and q.target_type = 'communication_message'
    left join public.communication_threads t on t.tenant_id = q.tenant_id and t.id = m.thread_id
    left join public.leads l on l.tenant_id = q.tenant_id and l.id = t.lead_id
    left join public.customers c on c.tenant_id = q.tenant_id and c.id = t.customer_id
    where q.tenant_id = $1
      and q.id = $2
      and q.action_type = 'email_send'
    limit 1
    `,
    [workspaceId, parsed.data.actionId]
  );

  const row = result?.rows[0];
  if (!row) return;

  if (row.status !== "approved" && row.status !== "queued") {
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: "Email must be approved before sending.",
      metadata: { currentStatus: row.status }
    });
    revalidatePath("/app/actions");
    return;
  }

  const recipient = row.message_recipient ?? row.recipient_label ?? row.lead_email ?? row.customer_email ?? "";
  const email = z.string().email().safeParse(recipient.trim());
  if (!email.success) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = 'Missing valid email recipient.',
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: "Missing valid email recipient.",
      metadata: { recipient }
    });
    revalidatePath("/app/actions");
    return;
  }

  const consent = await queryPostgres<{ id: string }>(
    `
    select id
    from public.contact_consent_records
    where tenant_id = $1
      and channel = 'email'
      and lower(contact_value) = lower($2)
      and status = 'granted'
    limit 1
    `,
    [workspaceId, email.data]
  );
  const suppressed = await queryPostgres<{ id: string }>(
    `
    select id
    from public.contact_suppression_list
    where tenant_id = $1
      and channel = 'email'
      and lower(contact_value) = lower($2)
      and active = true
    limit 1
    `,
    [workspaceId, email.data]
  );

  if (!consent?.rows[0] || suppressed?.rows[0]) {
    const reason = suppressed?.rows[0] ? "Email recipient is suppressed." : "Email consent is not granted.";
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id, reason]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: reason,
      metadata: { recipient: email.data }
    });
    revalidatePath("/app/actions");
    return;
  }

  const body = (row.payload_body ?? row.message_body ?? "").trim();
  const subject = (row.subject ?? row.thread_subject ?? "Message from Ferocity").trim();
  if (!body) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = 'Missing email body.',
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id]
    );
    revalidatePath("/app/actions");
    return;
  }

  const idempotencyKey = row.retry_count > 0
    ? `outbound-action:${row.id}:attempt:${row.retry_count}`
    : `outbound-action:${row.id}`;
  const sendResult = await sendMessage({
    tenantId: workspaceId,
    channel: "email",
    providerKey: row.provider_key === "resend_shared" || row.provider_key === "email_provider" ? "resend_email" : row.provider_key,
    to: email.data,
    subject,
    queueId: row.id,
    idempotencyKey,
    body,
    authorization: {
      source: "approved_action_queue",
      humanApproved: true
    },
    metadata: {
      source: "outbound_action_queue",
      originalProviderKey: row.provider_key
    }
  });

  if (!sendResult.ok) {
    const blocked = sendResult.status === 0;
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = $3,
          last_error = $4,
          processed_at = case when $3 = 'failed' then now() else processed_at end,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id, blocked ? "blocked" : "failed", sendResult.error]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: blocked ? "send.blocked" : "send.failed",
      status: "failed",
      message: sendResult.error,
      metadata: { providerStatus: sendResult.status }
    });
    revalidatePath("/app/actions");
    return;
  }

  if (sendResult.status !== "sent") {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'queued',
          last_error = null,
          metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        workspaceId,
        row.id,
        JSON.stringify({
          deliveryPending: true,
          messagingEngineStatus: sendResult.status,
          checkedAt: new Date().toISOString()
        })
      ]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.pending",
      status: "received",
      message: "Another worker already reserved this send, or the provider left it ready for manual completion.",
      metadata: { messagingEngineStatus: sendResult.status }
    });
    revalidatePath("/app/actions");
    return;
  }

  await queryPostgres(
    `
    update public.outbound_action_queue
    set status = 'sent',
        approved_by_user_id = coalesce(approved_by_user_id, $3),
        approved_at = coalesce(approved_at, now()),
        processed_at = now(),
        last_error = null,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      row.id,
      session?.userId ?? null,
      JSON.stringify({
        sentWith: "resend",
        providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
        sentAt: new Date().toISOString()
      })
    ]
  );

  if (row.target_id) {
    await queryPostgres(
      `
      update public.communication_messages
      set direction = 'outbound',
          status = 'sent_manually',
          provider_message_id = $3,
          sent_at = now(),
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and id = $2 and channel = 'email'
      `,
      [
        workspaceId,
        row.target_id,
        sendResult.ok ? sendResult.providerMessageId : null,
        JSON.stringify({ sentWith: sendResult.providerKey, outboundQueueId: row.id })
      ]
    );
  }

  await logDelivery({
    tenantId: workspaceId,
    queueId: row.id,
    providerKey: row.provider_key,
    eventType: "provider.accepted",
    status: "received",
    providerEventId: sendResult.ok ? sendResult.providerMessageId : null,
    message: `${sendResult.providerKey} accepted the email.`,
    metadata: { recipient: email.data }
  });
  await logProviderUsage({
    tenantId: workspaceId,
    queueId: row.id,
    providerKey: row.provider_key,
    actionType: "email_send",
    billingStatus: "included",
    metadata: { providerMessageId: sendResult.ok ? sendResult.providerMessageId : null, messagingEngineProvider: sendResult.providerKey }
  });
  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, user_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, $3, 'user', 'email_sent_resend', 'outbound_action_queue', $4, $5::jsonb)
    `,
    [
      workspaceId,
      row.brand_id,
      session?.userId ?? null,
      row.id,
      JSON.stringify({ providerMessageId: sendResult.ok ? sendResult.providerMessageId : null, recipient: email.data, messagingEngineProvider: sendResult.providerKey })
    ]
  );

  revalidatePath("/app/actions");
  revalidatePath("/app/operator");
}

export async function updateOutboundActionStatusAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const parsed = queueStatusSchema.safeParse({
    actionId: formData.get("actionId"),
    status: formData.get("status"),
    note: formData.get("note")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (parsed.data.status === "queued" || parsed.data.status === "sent_manually") {
    const current = await queryPostgres<{ provider_key: string; action_type: string }>(
      "select provider_key, action_type from public.outbound_action_queue where tenant_id = $1 and id = $2 limit 1",
      [workspaceId, parsed.data.actionId]
    );
    const actionType = current?.rows[0]?.action_type;
    const featureKey = actionType ? serviceForActionType[actionType] : null;
    if (featureKey) {
      const gate = await getServiceGate(workspaceId, featureKey);
      if (!gate.enabled) {
        await queryPostgres(
          `
          update public.outbound_action_queue
          set status = 'blocked',
              last_error = $3,
              metadata_json = metadata_json || $4::jsonb,
              updated_at = now()
          where tenant_id = $1 and id = $2
          `,
          [
            workspaceId,
            parsed.data.actionId,
            gate.reason,
            JSON.stringify({
              blockedByServiceControl: featureKey,
              mode: gate.mode,
              currentUsage: gate.currentUsage,
              usageLimit: gate.usageLimit
            })
          ]
        );
        await logDelivery({
          tenantId: workspaceId,
          queueId: parsed.data.actionId,
          providerKey: current?.rows[0]?.provider_key ?? "unknown",
          eventType: "status.blocked",
          status: "logged",
          message: gate.reason,
          metadata: { blockedByServiceControl: featureKey }
        });
        revalidatePath("/app/actions");
        return;
      }
    }
  }
  const result = await queryPostgres<{ provider_key: string; action_type: string }>(
    `
    update public.outbound_action_queue
    set status = $3,
        approved_by_user_id = case when $3 in ('approved', 'queued', 'sent_manually') then $4 else approved_by_user_id end,
        approved_at = case when $3 in ('approved', 'queued', 'sent_manually') then coalesce(approved_at, now()) else approved_at end,
        processed_at = case when $3 in ('sent_manually', 'sent', 'failed', 'canceled', 'blocked') then now() else processed_at end,
        metadata_json = metadata_json
          || $5::jsonb
          || case
            when status in ('failed', 'blocked') and $3 in ('approved', 'queued')
              then jsonb_build_object('retryCount', coalesce((metadata_json->>'retryCount')::int, 0) + 1)
            else '{}'::jsonb
          end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning provider_key, action_type
    `,
    [
      workspaceId,
      parsed.data.actionId,
      parsed.data.status,
      session?.userId ?? null,
      JSON.stringify({ lastReviewNote: parsed.data.note ?? "", reviewedAt: new Date().toISOString() })
    ]
  );

  const row = result?.rows[0];
  if (row) {
    await logDelivery({
      tenantId: workspaceId,
      queueId: parsed.data.actionId,
      providerKey: row.provider_key,
      eventType: `status.${parsed.data.status}`,
      message: parsed.data.note ?? "",
      metadata: { status: parsed.data.status }
    });

    if (parsed.data.status === "queued" || parsed.data.status === "sent_manually") {
      await logProviderUsage({
        tenantId: workspaceId,
        queueId: parsed.data.actionId,
        providerKey: row.provider_key,
        actionType: row.action_type,
        billingStatus: parsed.data.status === "sent_manually" ? "manual" : "included",
        metadata: { status: parsed.data.status, note: parsed.data.note ?? "" }
      });
    }
  }

  revalidatePath("/app/actions");
}
