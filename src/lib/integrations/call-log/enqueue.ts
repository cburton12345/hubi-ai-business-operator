import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import {
  externalCallLogPayloadSchema,
  type ExternalCallLogPayload,
  type ExternalCallLogProvider
} from "@/lib/integrations/call-log/contracts";
import { safeLogAppError } from "@/lib/observability/log-error";

type EnabledConnection = {
  connection_id: string;
  provider_key: ExternalCallLogProvider;
  external_contact_id: string | null;
};

function nextStepText(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 500) || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  for (const candidate of [item.title, item.action, item.description, item.task, item.text]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 500);
  }
  return null;
}

export async function enqueueExternalCallLogHandoffs(input: {
  tenantId: string;
  callId: string;
  providerCallId: string;
  direction: "inbound" | "outbound";
  status: string;
  outcome: string | null;
  summary: string;
  durationSeconds: number;
  callerNumber: string | null;
  qualification: string | null;
  actionItems: unknown[];
  appointmentId?: string | null;
  customerId: string | null;
  leadId: string | null;
  completedAt?: string;
}) {
  const enabled = await queryPostgres<EnabledConnection>(
    `
    select s.connection_id, s.provider_key,
      (
        select m.external_id
        from public.integration_object_mappings m
        where m.tenant_id = s.tenant_id
          and m.connection_id = s.connection_id
          and m.provider_deleted_at is null
          and (
            ($2::uuid is not null and m.internal_table = 'customers' and m.internal_id = $2::uuid)
            or ($3::uuid is not null and m.internal_table = 'leads' and m.internal_id = $3::uuid)
          )
        order by case when m.object_type = 'contact' then 0 else 1 end, m.updated_at desc
        limit 1
      ) as external_contact_id
    from public.external_call_log_settings s
    join public.integration_connections c on c.id = s.connection_id and c.tenant_id = s.tenant_id
    where s.tenant_id = $1
      and s.enabled = true
      and s.status = 'ready'
      and c.status = 'connected'
      and s.provider_key in ('highlevel','jobber','housecall_pro','hubspot','servicetitan')
    order by s.provider_key
    `,
    [input.tenantId, input.customerId, input.leadId]
  );
  const appUrl = (env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live").replace(/\/$/, "");
  const payload: ExternalCallLogPayload = externalCallLogPayloadSchema.parse({
    schemaVersion: 1,
    callId: input.callId,
    providerCallId: input.providerCallId,
    direction: input.direction,
    status: input.status,
    outcome: input.outcome,
    summary: input.summary.slice(0, 2_000),
    durationSeconds: Math.max(0, Math.round(input.durationSeconds)),
    callerNumber: input.callerNumber,
    qualification: input.qualification,
    nextSteps: input.actionItems.map(nextStepText).filter((value): value is string => Boolean(value)).slice(0, 20),
    appointmentId: input.appointmentId ?? null,
    customerId: input.customerId,
    leadId: input.leadId,
    ferocityUrl: `${appUrl}/app/calls/${input.callId}`,
    completedAt: input.completedAt ?? new Date().toISOString()
  });

  let queued = 0;
  let needsMapping = 0;
  for (const connection of enabled?.rows ?? []) {
    const status = connection.external_contact_id ? "queued" : "needs_mapping";
    await queryPostgres(
      `
      insert into public.external_call_log_deliveries (
        tenant_id,connection_id,call_id,provider_key,external_contact_id,status,
        idempotency_key,payload_json,metadata_json
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
      on conflict (tenant_id,connection_id,call_id) do update set
        external_contact_id = coalesce(public.external_call_log_deliveries.external_contact_id, excluded.external_contact_id),
        status = case
          when public.external_call_log_deliveries.status = 'delivered' then 'delivered'
          when excluded.external_contact_id is null then 'needs_mapping'
          else 'queued'
        end,
        payload_json = excluded.payload_json,
        safe_error_message = null,
        next_attempt_at = null,
        updated_at = now()
      `,
      [
        input.tenantId,
        connection.connection_id,
        input.callId,
        connection.provider_key,
        connection.external_contact_id,
        status,
        `external-call-log:${connection.connection_id}:${input.callId}`,
        JSON.stringify(payload),
        JSON.stringify({ source: "post_call_orchestration", transcriptIncluded: false })
      ]
    );
    if (status === "queued") queued += 1;
    else needsMapping += 1;
  }
  return { connections: enabled?.rows.length ?? 0, queued, needsMapping };
}

export async function safelyEnqueueExternalCallLogHandoffs(input: Parameters<typeof enqueueExternalCallLogHandoffs>[0]) {
  try {
    return await enqueueExternalCallLogHandoffs(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "External call-log handoff could not be queued.";
    await safeLogAppError({
      tenantId: input.tenantId,
      source: "integrations.call_log.enqueue",
      message,
      severity: "warning",
      retryable: true,
      metadata: { callId: input.callId, isolatedFromCall: true }
    });
    return { connections: 0, queued: 0, needsMapping: 0, error: message };
  }
}
