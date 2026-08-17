"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { servicePlatformProviders } from "@/lib/integrations/service-platform-bridge";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { revalidatePath } from "next/cache";
import { syncJobberReadModel } from "@/lib/integrations/jobber/read-model";

const providerSchema = z.enum(servicePlatformProviders);
const nativeTokenProviderSchema = z.enum(["highlevel", "hubspot"]);
const callLogSettingSchema = z.object({
  providerKey: providerSchema,
  enabled: z.enum(["true", "false"])
});

export async function createServicePlatformBridgeAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerSchema.safeParse(formData.get("providerKey"));
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const secret = randomSessionToken();
  const appUrl = (env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live").replace(/\/$/, "");
  const endpointResult = await queryPostgres<{ id: string }>(
    `insert into public.webhook_endpoints (tenant_id,name,url,direction,event_types_json,status,signing_secret_hint,inbound_token_hash,provider_key,connection_mode,metadata_json)
     values ($1,$2,$3,'inbound','["contact","lead","job"]'::jsonb,'active','token-created-copy-now',$4,$5,'middleware_bridge',$6::jsonb) returning id`,
    [tenantId, `${parsed.data} coexistence bridge`, `${appUrl}/api/integrations/service-platform/pending`, hashSessionToken(secret), parsed.data, JSON.stringify({ ownership: "provider_reads_ferocity_operates", deletes: "detach_only" })]
  );
  const endpointId = endpointResult?.rows[0]?.id;
  if (!endpointId) return;
  const url = `${appUrl}/api/integrations/service-platform/${endpointId}`;
  await queryPostgres("update public.webhook_endpoints set url=$2 where id=$1", [endpointId, url]);
  await queryPostgres(
    `insert into public.integration_connections (tenant_id,provider,display_name,status,credentials_status,scopes_json,metadata_json,last_checked_at)
     values ($1,$2,$3,'connected','configured','["contacts:read","leads:read","jobs:read"]'::jsonb,$4::jsonb,now())
     on conflict (tenant_id,provider) do update set status='connected',credentials_status='configured',metadata_json=public.integration_connections.metadata_json || excluded.metadata_json,updated_at=now()`,
    [tenantId, parsed.data, `${parsed.data.replaceAll("_", " ")} coexistence`, JSON.stringify({ connectionMode: "middleware_bridge", writeBackEnabled: false, endpointId })]
  );
  redirect(`/app/integrations/service-platforms?endpoint=${endpointId}&token=${encodeURIComponent(secret)}`);
}

export async function syncJobberReadModelAction() {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  await syncJobberReadModel({ tenantId });
  revalidatePath("/app/integrations/service-platforms");
}

export async function configureNativeServicePlatformConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = nativeTokenProviderSchema.safeParse(formData.get("providerKey"));
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const credential = await queryPostgres<{ ready: boolean }>(
    `select exists (
       select 1 from public.tenant_provider_credentials
       where tenant_id=$1 and provider_key=$2 and status='configured'
         and lower(regexp_replace(credential_label,'[^a-z0-9]+','_','g')) in
           ('oauth_access_token','private_integration_token','private_app_token','access_token','auth_token','service_key','api_key')
     ) as ready`,
    [tenantId, parsed.data]
  );
  if (credential?.rows[0]?.ready !== true) return;
  const scopes = parsed.data === "hubspot"
    ? ["crm.objects.contacts.read", "crm.objects.contacts.write"]
    : ["contacts.readonly", "contacts.write"];
  await queryPostgres(
    `insert into public.integration_connections (
       tenant_id,provider,display_name,status,credentials_status,scopes_json,metadata_json,last_checked_at
     ) values ($1,$2,$3,'connected','configured',$4::jsonb,$5::jsonb,now())
     on conflict (tenant_id,provider) do update set
       status='connected',credentials_status='configured',scopes_json=excluded.scopes_json,
       metadata_json=public.integration_connections.metadata_json || excluded.metadata_json,
       last_checked_at=now(),updated_at=now()`,
    [
      tenantId,
      parsed.data,
      parsed.data === "hubspot" ? "HubSpot customer account" : "HighLevel customer account",
      JSON.stringify(scopes),
      JSON.stringify({ connectionMode: "tenant_token", externalCallLogAvailable: true, outboundRequiresExplicitEnable: true })
    ]
  );
  revalidatePath("/app/integrations/service-platforms");
}

export async function setExternalCallLogHandoffAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = callLogSettingSchema.safeParse({
    providerKey: formData.get("providerKey"),
    enabled: formData.get("enabled")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const connection = await queryPostgres<{ id: string; status: string }>(
    "select id,status from public.integration_connections where tenant_id=$1 and provider=$2 limit 1",
    [tenantId, parsed.data.providerKey]
  );
  const row = connection?.rows[0];
  if (!row) return;

  if (parsed.data.enabled === "false") {
    await queryPostgres(
      `update public.external_call_log_settings
       set enabled=false,status='paused',updated_at=now()
       where tenant_id=$1 and connection_id=$2`,
      [tenantId, row.id]
    );
    revalidatePath("/app/integrations/service-platforms");
    return;
  }

  if (row.status !== "connected") return;
  const credential = await queryPostgres<{ native_ready: boolean; bridge_ready: boolean }>(
    `select exists (
       select 1 from public.tenant_provider_credentials
       where tenant_id=$1 and provider_key=$2 and status='configured'
         and lower(regexp_replace(credential_label,'[^a-z0-9]+','_','g')) in
          ('oauth_access_token','private_integration_token','private_app_token','access_token','auth_token','service_key','api_key')
     ) as native_ready,
     (select count(distinct lower(regexp_replace(credential_label,'[^a-z0-9]+','_','g')))=2
       from public.tenant_provider_credentials
       where tenant_id=$1 and provider_key=$2 and status='configured'
         and lower(regexp_replace(credential_label,'[^a-z0-9]+','_','g')) in
           ('call_log_webhook_url','call_log_webhook_secret')) as bridge_ready`,
    [tenantId, parsed.data.providerKey]
  );
  const nativeReady = ["highlevel", "hubspot"].includes(parsed.data.providerKey) && credential?.rows[0]?.native_ready === true;
  const bridgeReady = credential?.rows[0]?.bridge_ready === true;
  if (!nativeReady && !bridgeReady) return;
  const deliveryMode = nativeReady ? "native_api" : "signed_webhook";
  await queryPostgres(
    `insert into public.external_call_log_settings (
       tenant_id,connection_id,provider_key,enabled,status,delivery_mode,last_verified_at,metadata_json
     ) values ($1,$2,$3,true,'ready',$4,now(),$5::jsonb)
     on conflict (connection_id) do update set
       enabled=true,status='ready',delivery_mode=excluded.delivery_mode,last_verified_at=now(),
       metadata_json=public.external_call_log_settings.metadata_json || excluded.metadata_json,updated_at=now()`,
    [tenantId, row.id, parsed.data.providerKey, deliveryMode,
      JSON.stringify({
        enabledByOwner: true,
        transcriptIncluded: false,
        adapter: nativeReady
          ? parsed.data.providerKey === "hubspot" ? "hubspot_call_engagement" : "highlevel_contact_note"
          : "signed_webhook_bridge"
      })]
  );
  revalidatePath("/app/integrations/service-platforms");
}
