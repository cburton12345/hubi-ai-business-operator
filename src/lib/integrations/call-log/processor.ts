import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { externalCallLogPayloadSchema } from "@/lib/integrations/call-log/contracts";
import { getExternalCallLogAdapter } from "@/lib/integrations/call-log/registry";
import { deliverSignedExternalCallLog } from "@/lib/integrations/call-log/signed-webhook";
import { resolveHubSpotContactByPhone } from "@/lib/integrations/call-log/hubspot";

type DeliveryRow = {
  id: string;
  tenant_id: string;
  connection_id: string;
  call_id: string;
  provider_key: string;
  external_contact_id: string | null;
  payload_json: unknown;
  attempts: number;
  delivery_mode: "native_api" | "signed_webhook" | "manual_export";
};

function retryDelaySeconds(attempt: number) {
  return [60, 300, 1_800, 7_200][Math.min(Math.max(attempt - 1, 0), 3)];
}

async function accessTokenForDelivery(row: DeliveryRow) {
  const secrets = await resolveTenantProviderSecrets(row.tenant_id, row.provider_key);
  if (row.provider_key === "highlevel") {
    return secretByAliases(
      secrets,
      ["oauth_access_token", "private_integration_token", "access_token", "auth_token", "api_key"],
      "auth_token"
    );
  }
  if (row.provider_key === "hubspot") {
    return secretByAliases(
      secrets,
      ["private_app_token", "oauth_access_token", "access_token", "service_key", "api_key"],
      "auth_token"
    );
  }
  return null;
}

async function signedWebhookConfigForDelivery(row: DeliveryRow) {
  const secrets = await resolveTenantProviderSecrets(row.tenant_id, row.provider_key);
  return {
    destinationUrl: secretByAliases(secrets, ["call_log_webhook_url", "outbound_webhook_url"]),
    signingSecret: secretByAliases(secrets, ["call_log_webhook_secret", "outbound_webhook_secret"], "webhook_secret")
  };
}

async function claimNextDelivery(tenantId: string) {
  const result = await queryPostgres<DeliveryRow>(
    `
    with candidate as (
      select d.id,s.delivery_mode
      from public.external_call_log_deliveries d
      join public.external_call_log_settings s on s.connection_id=d.connection_id and s.tenant_id=d.tenant_id
      where d.tenant_id=$1
        and d.status in ('queued','retry','needs_mapping')
        and coalesce(d.next_attempt_at,now()) <= now()
        and (d.external_contact_id is not null or (s.delivery_mode='native_api' and d.provider_key='hubspot'))
        and s.enabled=true and s.status='ready'
      order by d.created_at
      limit 1
      for update skip locked
    )
    update public.external_call_log_deliveries d
    set status = 'delivering', attempts = d.attempts + 1, updated_at = now()
    from candidate
    where d.id=candidate.id
    returning d.id,d.tenant_id,d.connection_id,d.call_id,d.provider_key,d.external_contact_id,
      d.payload_json,d.attempts,candidate.delivery_mode
    `,
    [tenantId]
  );
  return result?.rows[0] ?? null;
}

async function failDelivery(row: DeliveryRow, message: string) {
  const safeMessage = message.slice(0, 1_000);
  if (row.attempts >= 5) {
    await queryPostgres(
      `
      update public.external_call_log_deliveries
      set status='dead_lettered',safe_error_message=$2,next_attempt_at=null,updated_at=now()
      where id=$1
      `,
      [row.id, safeMessage]
    );
    await queryPostgres(
      `
      insert into public.integration_dead_letters (
        tenant_id,connection_id,provider_key,operation,object_type,internal_id,error_category,
        safe_error_message,payload_summary_json,attempts,status
      ) values ($1,$2,$3,'external_call_log','receptionist_call',$4,'provider_delivery',$5,$6::jsonb,$7,'open')
      `,
      [
        row.tenant_id,
        row.connection_id,
        row.provider_key,
        row.call_id,
        safeMessage,
        JSON.stringify({ callId: row.call_id, deliveryId: row.id, transcriptIncluded: false }),
        row.attempts
      ]
    );
    return "dead_lettered" as const;
  }
  await queryPostgres(
    `
    update public.external_call_log_deliveries
    set status='retry',safe_error_message=$2,
      next_attempt_at=now()+make_interval(secs=>$3),updated_at=now()
    where id=$1
    `,
    [row.id, safeMessage, retryDelaySeconds(row.attempts)]
  );
  return "retry" as const;
}

export async function processExternalCallLogQueueForTenant(tenantId: string, limit = 10) {
  const result = { checked: 0, delivered: 0, retried: 0, deadLettered: 0, blocked: 0 };
  for (let index = 0; index < Math.max(1, Math.min(limit, 50)); index += 1) {
    const row = await claimNextDelivery(tenantId);
    if (!row) break;
    result.checked += 1;
    const adapter = row.delivery_mode === "native_api" ? getExternalCallLogAdapter(row.provider_key) : null;
    if (row.delivery_mode === "native_api" && !adapter) {
      await queryPostgres(
        "update public.external_call_log_deliveries set status='blocked',safe_error_message=$2,updated_at=now() where id=$1",
        [row.id, `${row.provider_key} call-log adapter is not certified.`]
      );
      result.blocked += 1;
      continue;
    }
    try {
      const payload = externalCallLogPayloadSchema.parse(row.payload_json);
      let accessToken: string | null = null;
      if (!row.external_contact_id && row.provider_key === "hubspot" && row.delivery_mode === "native_api") {
        accessToken = await accessTokenForDelivery(row);
        if (!accessToken) throw new Error("HubSpot outbound credentials are not configured.");
        const matchedContactId = payload.callerNumber
          ? await resolveHubSpotContactByPhone({ accessToken, phone: payload.callerNumber })
          : null;
        if (!matchedContactId) {
          await queryPostgres(
            "update public.external_call_log_deliveries set status='blocked',safe_error_message=$2,updated_at=now() where id=$1",
            [row.id, "No unique HubSpot contact matched the caller phone number."]
          );
          result.blocked += 1;
          continue;
        }
        row.external_contact_id = matchedContactId;
        await queryPostgres(
          "update public.external_call_log_deliveries set external_contact_id=$2,status='delivering',updated_at=now() where id=$1",
          [row.id, matchedContactId]
        );
        const mapping = payload.customerId
          ? { objectType: "contact", internalTable: "customers", internalId: payload.customerId }
          : payload.leadId
            ? { objectType: "contact", internalTable: "leads", internalId: payload.leadId }
            : null;
        if (mapping) {
          await queryPostgres(
            `insert into public.integration_object_mappings (
               tenant_id,connection_id,provider_key,object_type,internal_table,internal_id,external_id,ownership_mode,last_synced_at,metadata_json
             ) values ($1,$2,'hubspot',$3,$4,$5,$6,'shared',now(),$7::jsonb)
             on conflict (connection_id,object_type,external_scope,external_id) do update set
               internal_table=excluded.internal_table,internal_id=excluded.internal_id,provider_deleted_at=null,
               last_synced_at=now(),metadata_json=public.integration_object_mappings.metadata_json || excluded.metadata_json,updated_at=now()`,
            [row.tenant_id, row.connection_id, mapping.objectType, mapping.internalTable, mapping.internalId, matchedContactId,
              JSON.stringify({ resolvedBy: "exact_normalized_phone", source: "external_call_log" })]
          );
        }
      }
      if (!row.external_contact_id) throw new Error(`${row.provider_key} contact mapping is not available.`);
      let delivery;
      if (row.delivery_mode === "signed_webhook") {
        const config = await signedWebhookConfigForDelivery(row);
        if (!config.destinationUrl || !config.signingSecret) throw new Error(`${row.provider_key} call-log bridge credentials are not configured.`);
        delivery = await deliverSignedExternalCallLog({
          providerKey: row.provider_key as Parameters<typeof deliverSignedExternalCallLog>[0]["providerKey"],
          destinationUrl: config.destinationUrl,
          signingSecret: config.signingSecret,
          externalContactId: row.external_contact_id,
          payload
        });
      } else {
        accessToken ??= await accessTokenForDelivery(row);
        if (!accessToken) throw new Error(`${row.provider_key} outbound credentials are not configured.`);
        delivery = await adapter!.deliver({ accessToken, externalContactId: row.external_contact_id, payload });
      }
      await queryPostgres(
        `
        update public.external_call_log_deliveries
        set status='delivered',external_record_id=$2,safe_error_message=null,next_attempt_at=null,
          delivered_at=now(),metadata_json=metadata_json || $3::jsonb,updated_at=now()
        where id=$1
        `,
        [row.id, delivery.externalRecordId, JSON.stringify({ providerResponse: delivery.providerResponse ?? {} })]
      );
      result.delivered += 1;
    } catch (error) {
      const disposition = await failDelivery(row, error instanceof Error ? error.message : "Provider delivery failed.");
      if (disposition === "dead_lettered") result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}
