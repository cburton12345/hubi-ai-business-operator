import { queryPostgres } from "@/lib/db/postgres";
import { recordCapabilityDeliveryEvidence } from "@/lib/reliability/capability-runtime";

export const normalizedDeliveryStatuses = [
  "accepted",
  "queued",
  "sending",
  "sent",
  "delivered",
  "failed",
  "rejected",
  "undelivered",
  "suspected_filtered",
  "unknown"
] as const;

export type NormalizedDeliveryStatus = (typeof normalizedDeliveryStatuses)[number];

export type DeliveryReceipt = {
  tenantId: string;
  providerKey: string;
  providerMessageId: string;
  normalizedStatus: NormalizedDeliveryStatus;
  rawStatus: string;
  errorCode?: string | null;
  safeReason?: string | null;
  receiptAt?: Date;
  isFinal?: boolean;
  suspectedFiltered?: boolean;
  providerEventId?: string | null;
  metadata?: Record<string, unknown>;
};

const unhealthyStatuses = new Set<NormalizedDeliveryStatus>([
  "failed",
  "rejected",
  "undelivered",
  "suspected_filtered"
]);

export function isFinalDeliveryStatus(status: NormalizedDeliveryStatus) {
  return status === "delivered" || unhealthyStatuses.has(status);
}

export function canonicalMessageStatus(status: NormalizedDeliveryStatus) {
  if (status === "delivered") return "delivered";
  if (unhealthyStatuses.has(status)) return "failed";
  if (status === "sending" || status === "sent") return "sent";
  return "queued";
}

export function shouldApplyDeliveryUpdate(input: {
  currentStatus: NormalizedDeliveryStatus;
  currentFinal: boolean;
  currentUpdatedAt?: Date | null;
  incomingStatus: NormalizedDeliveryStatus;
  incomingFinal: boolean;
  incomingReceiptAt: Date;
}) {
  if (input.currentStatus === "delivered" && input.incomingStatus !== "delivered") return false;
  if (input.incomingStatus === "delivered") return true;
  if (input.currentFinal && !input.incomingFinal) return false;
  if (input.currentUpdatedAt && input.incomingReceiptAt.getTime() < input.currentUpdatedAt.getTime()) return false;
  return true;
}

export function normalizeTwilioDeliveryReceipt(input: {
  status: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const rawStatus = (input.status ?? "unknown").trim().toLowerCase();
  const errorCode = input.errorCode?.trim() || null;
  const suspectedFiltered = ["30007", "30038", "30039"].includes(errorCode ?? "");
  let normalizedStatus: NormalizedDeliveryStatus;

  if (suspectedFiltered) normalizedStatus = "suspected_filtered";
  else if (["accepted", "scheduled"].includes(rawStatus)) normalizedStatus = "accepted";
  else if (rawStatus === "queued") normalizedStatus = "queued";
  else if (rawStatus === "sending") normalizedStatus = "sending";
  else if (["sent", "read"].includes(rawStatus)) normalizedStatus = rawStatus === "read" ? "delivered" : "sent";
  else if (rawStatus === "delivered") normalizedStatus = "delivered";
  else if (["failed", "canceled"].includes(rawStatus)) normalizedStatus = "failed";
  else if (rawStatus === "undelivered") normalizedStatus = "undelivered";
  else normalizedStatus = "unknown";

  return {
    normalizedStatus,
    rawStatus,
    errorCode,
    safeReason: input.errorMessage?.trim() || (suspectedFiltered ? "The provider or carrier reported that the message was filtered." : null),
    suspectedFiltered,
    isFinal: isFinalDeliveryStatus(normalizedStatus)
  };
}

export function normalizeResendDeliveryReceipt(input: {
  status: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const rawStatus = (input.status ?? "unknown").trim().toLowerCase();
  let normalizedStatus: NormalizedDeliveryStatus;
  if (["email.delivered", "email.opened", "email.clicked", "email.complained"].includes(rawStatus)) normalizedStatus = "delivered";
  else if (rawStatus === "email.sent") normalizedStatus = "sent";
  else if (["email.scheduled", "email.delivery_delayed"].includes(rawStatus)) normalizedStatus = "queued";
  else if (rawStatus === "email.bounced") normalizedStatus = "undelivered";
  else if (rawStatus === "email.suppressed") normalizedStatus = "rejected";
  else if (rawStatus === "email.failed") normalizedStatus = "failed";
  else normalizedStatus = "unknown";
  return {
    normalizedStatus,
    rawStatus,
    errorCode: input.errorCode?.trim() || null,
    safeReason: input.errorMessage?.trim() || null,
    suspectedFiltered: false,
    isFinal: isFinalDeliveryStatus(normalizedStatus)
  };
}

function receiptIdempotencyKey(receipt: DeliveryReceipt) {
  return [
    receipt.providerKey,
    receipt.providerEventId || receipt.providerMessageId,
    receipt.rawStatus,
    receipt.errorCode || "none"
  ].join(":");
}

export async function recordMessageDeliveryReceipt(receipt: DeliveryReceipt) {
  const receiptAt = receipt.receiptAt ?? new Date();
  const isFinal = receipt.isFinal ?? isFinalDeliveryStatus(receipt.normalizedStatus);
  const suspectedFiltered = receipt.suspectedFiltered ?? receipt.normalizedStatus === "suspected_filtered";
  const idempotencyKey = receiptIdempotencyKey(receipt);

  const messageResult = await queryPostgres<{
    id: string;
    conversation_id: string | null;
    delivery_status: NormalizedDeliveryStatus;
    delivery_final: boolean;
    delivery_updated_at: Date | null;
  }>(
    `select id, conversation_id, delivery_status, delivery_final, delivery_updated_at
     from public.messages
     where tenant_id=$1 and provider_key=$2 and provider_message_ref=$3
     order by created_at desc limit 1`,
    [receipt.tenantId, receipt.providerKey, receipt.providerMessageId]
  );
  const message = messageResult?.rows[0] ?? null;

  const eventResult = await queryPostgres<{ id: string }>(
    `insert into public.message_delivery_events
      (tenant_id, message_id, provider_key, event_type, provider_event_ref, status,
       safe_error_message, metadata_json, normalized_status, raw_provider_status,
       provider_error_code, receipt_at, is_final, suspected_filtered, idempotency_key)
     values ($1,$2,$3,'delivery_status',$4,'logged',$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13)
     on conflict (tenant_id, provider_key, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [
      receipt.tenantId,
      message?.id ?? null,
      receipt.providerKey,
      receipt.providerEventId ?? receipt.providerMessageId,
      receipt.safeReason ?? null,
      JSON.stringify(receipt.metadata ?? {}),
      receipt.normalizedStatus,
      receipt.rawStatus,
      receipt.errorCode ?? null,
      receiptAt.toISOString(),
      isFinal,
      suspectedFiltered,
      idempotencyKey
    ]
  );
  if (!eventResult?.rows[0]) return { recorded: false, duplicate: true, messageId: message?.id ?? null };
  if (!message) return { recorded: true, duplicate: false, messageId: null };

  const apply = shouldApplyDeliveryUpdate({
    currentStatus: message.delivery_status,
    currentFinal: message.delivery_final,
    currentUpdatedAt: message.delivery_updated_at,
    incomingStatus: receipt.normalizedStatus,
    incomingFinal: isFinal,
    incomingReceiptAt: receiptAt
  });
  if (apply) {
    await queryPostgres(
      `update public.messages
       set status=$4, delivery_status=$5, delivery_raw_status=$6,
           delivery_error_code=$7, delivery_safe_reason=$8, delivery_final=$9,
           delivery_updated_at=$10, metadata_json=metadata_json || $11::jsonb
       where tenant_id=$1 and provider_key=$2 and id=$3`,
      [
        receipt.tenantId,
        receipt.providerKey,
        message.id,
        canonicalMessageStatus(receipt.normalizedStatus),
        receipt.normalizedStatus,
        receipt.rawStatus,
        receipt.errorCode ?? null,
        receipt.safeReason ?? null,
        isFinal,
        receiptAt.toISOString(),
        JSON.stringify({ latestDeliveryEventId: eventResult.rows[0].id })
      ]
    );
    if (receipt.normalizedStatus === "delivered" || unhealthyStatuses.has(receipt.normalizedStatus) || receipt.normalizedStatus === "unknown") {
      await recordCapabilityDeliveryEvidence({
        tenantId: receipt.tenantId,
        providerKey: receipt.providerKey,
        providerReference: receipt.providerMessageId,
        state: receipt.normalizedStatus === "delivered" ? "delivered" : receipt.normalizedStatus === "unknown" ? "unknown" : "failed",
        evidence: {
          normalizedStatus: receipt.normalizedStatus,
          rawStatus: receipt.rawStatus,
          errorCode: receipt.errorCode ?? null,
          receiptAt: receiptAt.toISOString(),
          providerEventId: receipt.providerEventId ?? null
        },
        error: unhealthyStatuses.has(receipt.normalizedStatus) ? receipt.safeReason ?? `Delivery ${receipt.normalizedStatus}.` : null
      });
    }
  }

  const alertKey = `message-health:${message.id}`;
  if (unhealthyStatuses.has(receipt.normalizedStatus)) {
    const summary = receipt.safeReason
      || `The ${receipt.providerKey} delivery update was ${receipt.normalizedStatus.replaceAll("_", " ")}.`;
    await Promise.all([
      queryPostgres(
        `insert into public.messaging_provider_failures
          (tenant_id, provider_key, route_name, safe_error_category, safe_error_message,
           retryable, correlation_id, metadata_json)
         values ($1,$2,'deliveryReceipt',$3,$4,true,$5,$6::jsonb)`,
        [
          receipt.tenantId,
          receipt.providerKey,
          receipt.normalizedStatus,
          summary,
          message.id,
          JSON.stringify({ errorCode: receipt.errorCode ?? null, providerMessageId: receipt.providerMessageId })
        ]
      ),
      queryPostgres(
        `insert into public.operator_alerts
          (tenant_id, alert_key, category, severity, status, title, summary, action_href, metadata_json)
         values ($1,$2,'integration',$3,'active','A customer message needs attention',$4,'/app/messaging',$5::jsonb)
         on conflict (tenant_id, alert_key) do update set
           severity=excluded.severity, status='active', summary=excluded.summary,
           metadata_json=public.operator_alerts.metadata_json || excluded.metadata_json,
           last_seen_at=now(), resolved_at=null, updated_at=now()`,
        [
          receipt.tenantId,
          alertKey,
          suspectedFiltered ? "high" : "medium",
          summary,
          JSON.stringify({ messageId: message.id, conversationId: message.conversation_id, providerKey: receipt.providerKey })
        ]
      )
    ]);
  } else if (receipt.normalizedStatus === "delivered") {
    await queryPostgres(
      `update public.operator_alerts
       set status='resolved', resolved_at=now(), updated_at=now()
       where tenant_id=$1 and alert_key=$2 and status='active'`,
      [receipt.tenantId, alertKey]
    );
  }

  return { recorded: true, duplicate: false, messageId: message.id, applied: apply };
}
