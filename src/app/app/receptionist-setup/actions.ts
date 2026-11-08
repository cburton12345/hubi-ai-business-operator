"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getIndustryKnowledgeContext } from "@/lib/industry-knowledge/get-industry-context";
import { listPhoneProviders } from "@/lib/phone/provider-registry";
import { getPhoneConnection, inferNorthAmericanAreaCode, savePhoneConnection } from "@/lib/phone/phone-connections";
import { ProviderBackedVoiceAgent } from "@/lib/phone/voice-agent";
import {
  buildVoiceAgentSystemPrompt,
  voiceProfileFromStored
} from "@/lib/phone/voice-agent-profile";
import { getVoiceAgentProvider } from "@/lib/providers/voice-adapters";
import { getVoiceMaxDurationSeconds } from "@/lib/usage/managed-voice";
import { listHumanTransferDestinations, transferRoutingRoles } from "@/lib/phone/transfer-routing";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const voiceProviderSchema = z.string().trim().min(2).max(120);
const activateVoiceSchema = z.object({ providerKey: voiceProviderSchema });
const managedNumberSchema = z.object({ numberId: z.string().uuid() });

const testCallSchema = z.object({
  providerKey: voiceProviderSchema,
  toNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  consentConfirmed: z.literal("true")
});

const providerRouteSchema = z.object({
  primaryProviderKey: voiceProviderSchema,
  fallbackProviderKey: z.string().trim().max(120)
});

const phoneConnectionSchema = z.object({
  connectionPath: z.enum([
    "keep_number_forwarding",
    "keep_number_full",
    "new_ferocity_number",
    "bring_own_provider"
  ]),
  businessNumber: z.string().trim().max(40).regex(/^[+()\d\s.-]*$/),
  currentCarrier: z.string().trim().max(160),
  fullIntegrationMethod: z.enum(["number_port", "cloud_phone", "pbx", "carrier_connection"]).optional(),
  preferredAreaCode: z.string().trim().regex(/^$|^\d{3}$/),
  intendedUse: z.string().trim().max(80),
  humanTransferNumber: z.string().trim().max(40).regex(/^[+()\d\s.-]*$/),
  phoneProviderKey: z.string().trim().max(120),
  phoneProviderLabel: z.string().trim().max(160),
  smsRequested: z.boolean(),
  mmsRequested: z.boolean(),
  managedNumberProvisioningApproved: z.boolean()
});

const transferDestinationSchema = z.object({
  label: z.string().trim().min(2).max(80),
  routingRole: z.enum(transferRoutingRoles),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  priority: z.coerce.number().int().min(1).max(999),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  availableStart: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  availableEnd: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80),
  isPrimary: z.boolean(),
  authorizationConfirmed: z.literal(true)
});

export async function savePhoneConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = phoneConnectionSchema.safeParse({
    connectionPath: formData.get("connectionPath"),
    businessNumber: String(formData.get("businessNumber") ?? ""),
    currentCarrier: String(formData.get("currentCarrier") ?? ""),
    fullIntegrationMethod: formData.get("fullIntegrationMethod") || undefined,
    preferredAreaCode: String(formData.get("preferredAreaCode") ?? ""),
    intendedUse: String(formData.get("intendedUse") ?? ""),
    humanTransferNumber: String(formData.get("humanTransferNumber") ?? ""),
    phoneProviderKey: String(formData.get("phoneProviderKey") ?? ""),
    phoneProviderLabel: String(formData.get("phoneProviderLabel") ?? ""),
    smsRequested: formData.get("smsRequested") === "true",
    mmsRequested: formData.get("mmsRequested") === "true",
    managedNumberProvisioningApproved: formData.get("managedNumberProvisioningApproved") === "true"
  });
  if (!parsed.success) return;
  if (parsed.data.connectionPath === "new_ferocity_number" && !parsed.data.managedNumberProvisioningApproved) return;
  if (
    parsed.data.humanTransferNumber
    && !/^\+[1-9]\d{7,14}$/.test(parsed.data.humanTransferNumber)
  ) return;
  if (
    parsed.data.connectionPath === "new_ferocity_number"
    && !/^\+[1-9]\d{7,14}$/.test(parsed.data.humanTransferNumber)
  ) return;
  if (
    ["keep_number_forwarding", "keep_number_full"].includes(parsed.data.connectionPath)
    && !parsed.data.businessNumber
  ) return;
  if (parsed.data.connectionPath === "bring_own_provider" && !parsed.data.phoneProviderKey) return;
  if (
    parsed.data.connectionPath === "bring_own_provider"
    && parsed.data.phoneProviderKey === "other"
    && !parsed.data.phoneProviderLabel
  ) return;

  const provider = listPhoneProviders().find(
    (candidate) => candidate.providerKey === parsed.data.phoneProviderKey
  );
  const providerLabel = parsed.data.phoneProviderKey === "other"
    ? parsed.data.phoneProviderLabel
    : provider?.displayName ?? parsed.data.phoneProviderLabel;
  const tenantId = await getCurrentWorkspaceId();
  const preferredAreaCode = parsed.data.connectionPath === "new_ferocity_number"
    ? parsed.data.preferredAreaCode || inferNorthAmericanAreaCode(parsed.data.humanTransferNumber) || ""
    : parsed.data.preferredAreaCode;
  await savePhoneConnection({
    tenantId,
    connectionPath: parsed.data.connectionPath,
    businessNumber: parsed.data.businessNumber,
    currentCarrier: parsed.data.currentCarrier,
    fullIntegrationMethod: parsed.data.fullIntegrationMethod ?? null,
    preferredAreaCode,
    intendedUse: parsed.data.intendedUse,
    humanTransferNumber: parsed.data.humanTransferNumber,
    smsRequested: parsed.data.smsRequested,
    mmsRequested: parsed.data.mmsRequested,
    phoneProviderKey: parsed.data.connectionPath === "bring_own_provider"
      ? parsed.data.phoneProviderKey
      : null,
    phoneProviderLabel: parsed.data.connectionPath === "bring_own_provider"
      ? providerLabel
      : null,
    managedNumberProvisioningApproved: parsed.data.managedNumberProvisioningApproved
  });

  // An existing voice assistant must not keep a stale human-transfer destination.
  // Only synchronize assistants that have already been provisioned; first-time setup
  // continues through the explicit provider activation flow below.
  const activeVoiceRoute = await queryPostgres<{ provider_key: string }>(
    `
    select r.primary_provider_key as provider_key
    from public.voice_provider_routes r
    join public.provider_accounts a
      on a.tenant_id = r.tenant_id and a.provider_key = r.primary_provider_key
    where r.tenant_id = $1
      and r.route_family = 'voice_orchestrator'
      and nullif(a.metadata_json->>'assistantId', '') is not null
    limit 1
    `,
    [tenantId]
  );
  const activeProviderKey = activeVoiceRoute?.rows[0]?.provider_key;
  if (activeProviderKey) {
    await syncVoiceAssistantForTenant(tenantId, activeProviderKey);
  }
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/office-manager");
}

export async function requestManagedNumberPortOutAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = managedNumberSchema.safeParse({ numberId: formData.get("numberId") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const protectedNumber = await queryPostgres<{ id: string }>(
    `update public.telephony_numbers set port_out_requested_at=coalesce(port_out_requested_at,now()),
       status='needs_attention',outbound_enabled=false,
       retain_until=greatest(coalesce(retain_until,now()),now()+interval '30 days'),
       metadata_json=metadata_json||'{"automaticReleaseBlocked":"port_out_requested"}'::jsonb,updated_at=now()
     where id=$1 and tenant_id=$2 and number_mode='ferocity_managed' and status<>'released'
     returning id`,
    [parsed.data.numberId, tenantId]
  );
  if (!protectedNumber?.rows[0]) return;
  await queryPostgres(
    `update public.phone_number_lifecycle_jobs set status='cancelled',updated_at=now(),
       safe_error_message='Customer requested port-out; automatic release cancelled.'
     where telephony_number_id=$1 and tenant_id=$2 and action='release' and status in ('queued','retrying')`,
    [parsed.data.numberId, tenantId]
  );
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
       owner_attention,ai_handled,recommended_action,action_href,risk_type,confidence_score,metadata_json
     ) values ($1,'ferocity','Ferocity',$2,'phone.port_out_requested','Number protected for port-out',
       'Automatic release is blocked. Ferocity support will coordinate a verified number transfer.','high','needs_owner',true,false,
       'Keep billing and contact details current while the transfer is completed.','/app/receptionist-setup','operations',100,$3::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing`,
    [tenantId, `phone-port-out:${parsed.data.numberId}`, JSON.stringify({ numberId: parsed.data.numberId })]
  );
  revalidatePath("/app/receptionist-setup");
}

export async function saveHumanTransferDestinationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = transferDestinationSchema.safeParse({
    label: formData.get("label"),
    routingRole: formData.get("routingRole"),
    phoneNumber: formData.get("phoneNumber"),
    priority: formData.get("priority") ?? 100,
    weekdays: Array.from({ length: 7 }, (_, day) => formData.get(`weekday:${day}`) === "on" ? day : null).filter((day): day is number => day !== null),
    availableStart: formData.get("availableStart") ?? "",
    availableEnd: formData.get("availableEnd") ?? "",
    timezone: formData.get("timezone") ?? "America/Chicago",
    isPrimary: formData.get("isPrimary") === "on",
    authorizationConfirmed: formData.get("authorizationConfirmed") === "on"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  if (parsed.data.isPrimary) {
    await queryPostgres(
      `update public.call_transfer_destinations set is_primary=false,updated_at=now()
        where tenant_id=$1 and brand_id is null and is_primary=true`,
      [tenantId]
    );
  }
  await queryPostgres(
    `insert into public.call_transfer_destinations (
       tenant_id,label,routing_role,phone_number,priority,weekdays_json,available_start,available_end,
       timezone,is_primary,authorization_confirmed_at,metadata_json
     ) values ($1,$2,$3,$4,$5,$6::jsonb,nullif($7,'')::time,nullif($8,'')::time,$9,$10,now(),'{"source":"receptionist_setup"}'::jsonb)
     on conflict (tenant_id,phone_number,routing_role) do update set
       label=excluded.label,priority=excluded.priority,weekdays_json=excluded.weekdays_json,available_start=excluded.available_start,
       available_end=excluded.available_end,timezone=excluded.timezone,is_primary=excluded.is_primary,
       is_active=true,authorization_confirmed_at=now(),updated_at=now()`,
    [tenantId, parsed.data.label, parsed.data.routingRole, parsed.data.phoneNumber,
      parsed.data.priority, JSON.stringify(parsed.data.weekdays), parsed.data.availableStart, parsed.data.availableEnd,
      parsed.data.timezone, parsed.data.isPrimary]
  );
  await synchronizeExistingVoiceRoute(tenantId);
  revalidatePath("/app/receptionist-setup");
}

export async function removeHumanTransferDestinationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = z.object({ destinationId: z.string().uuid() }).safeParse({ destinationId: formData.get("destinationId") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `update public.call_transfer_destinations set is_active=false,is_primary=false,updated_at=now()
      where tenant_id=$1 and id=$2`,
    [tenantId, parsed.data.destinationId]
  );
  await synchronizeExistingVoiceRoute(tenantId);
  revalidatePath("/app/receptionist-setup");
}

async function synchronizeExistingVoiceRoute(tenantId: string) {
  const route = await queryPostgres<{ provider_key: string }>(
    `select r.primary_provider_key as provider_key
       from public.voice_provider_routes r
       join public.provider_accounts a on a.tenant_id=r.tenant_id and a.provider_key=r.primary_provider_key
      where r.tenant_id=$1 and r.route_family='voice_orchestrator'
        and nullif(a.metadata_json->>'assistantId','') is not null limit 1`,
    [tenantId]
  );
  if (route?.rows[0]?.provider_key) await syncVoiceAssistantForTenant(tenantId, route.rows[0].provider_key);
}

export async function selectVoiceProviderRouteAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerRouteSchema.safeParse({
    primaryProviderKey: formData.get("primaryProviderKey"),
    fallbackProviderKey: formData.get("fallbackProviderKey") ?? ""
  });
  const primaryProvider = parsed.success
    ? getVoiceAgentProvider(parsed.data.primaryProviderKey)
    : null;
  if (
    !parsed.success
    || parsed.data.primaryProviderKey === parsed.data.fallbackProviderKey
    || !primaryProvider
    || (parsed.data.fallbackProviderKey && !getVoiceAgentProvider(parsed.data.fallbackProviderKey))
  ) return;
  const tenantId = await getCurrentWorkspaceId();
  const current = await queryPostgres<{ primary_provider_key: string; live_actions_enabled: boolean }>(
    `
    select primary_provider_key, live_actions_enabled
    from public.voice_provider_routes
    where tenant_id = $1 and route_family = 'voice_orchestrator'
    limit 1
    `,
    [tenantId]
  );
  if (
    current?.rows[0]?.live_actions_enabled
    && current.rows[0].primary_provider_key !== parsed.data.primaryProviderKey
  ) {
    return;
  }
  await queryPostgres(
    `
    update public.voice_provider_routes
    set primary_provider_key = $2,
        fallback_provider_key = nullif($3, ''),
        status = case
          when exists (
            select 1 from public.provider_accounts
            where tenant_id = $1 and provider_key = $2 and credentials_status = 'configured'
          ) then 'configured'
          else 'planned'
        end,
        live_actions_enabled = false,
        plain_language_status = 'Voice provider preference saved. Live calls remain off until this adapter is configured, tested, and activated.',
        updated_at = now()
    where tenant_id = $1 and route_family = 'voice_orchestrator'
    `,
    [tenantId, parsed.data.primaryProviderKey, parsed.data.fallbackProviderKey]
  );
  await queryPostgres(
    `
    update public.provider_connection_lanes
    set provider_key = $2,
        display_name = $3,
        connection_status = case
          when exists (
            select 1 from public.provider_accounts
            where tenant_id = $1 and provider_key = $2 and credentials_status = 'configured'
          ) then 'paused'
          else 'not_connected'
        end,
        live_actions_enabled = false,
        plain_language_status = 'Preferred voice adapter selected. Live calling remains off until setup, testing, and activation are complete.',
        updated_at = now()
    where tenant_id = $1 and capability_key = 'voice_ai' and lane_key = 'customer_owned'
    `,
    [tenantId, parsed.data.primaryProviderKey, `Customer ${primaryProvider.displayName} voice account`]
  );
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/office-manager");
}

export async function syncVoiceAssistantAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const provider = voiceProviderSchema.safeParse(formData.get("providerKey"));
  if (!provider.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await syncVoiceAssistantForTenant(tenantId, provider.data);
}

async function syncVoiceAssistantForTenant(tenantId: string, providerKey: string) {
  const adapter = getVoiceAgentProvider(providerKey);
  if (!adapter || adapter.adapterStatus !== "live") return;

  const profileResult = await queryPostgres<{
    brand_id: string | null;
    display_name: string;
    role_summary: string;
    default_tone: string;
    escalation_rules_json: unknown;
    guardrails_json: unknown;
    metadata_json: unknown;
    assistant_id: string | null;
    outbound_assistant_id: string | null;
  }>(
    `
    select p.brand_id, p.display_name, p.role_summary, p.default_tone,
           p.escalation_rules_json, p.guardrails_json, p.metadata_json,
           nullif(a.metadata_json->>'assistantId', '') as assistant_id,
           nullif(a.metadata_json->>'outboundAssistantId', '') as outbound_assistant_id
    from public.office_manager_profiles p
    left join public.provider_accounts a
      on a.tenant_id = p.tenant_id and a.provider_key = $2
    where p.tenant_id = $1 and p.status in ('ready', 'active', 'needs_attention')
    order by p.updated_at desc
    limit 1
    `,
    [tenantId, providerKey]
  );
  const profile = profileResult?.rows[0];
  if (!profile) return;

  const appUrl = (env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const businessProfile = voiceProfileFromStored({
    displayName: profile.display_name,
    roleSummary: profile.role_summary,
    tone: profile.default_tone,
    escalationRules: profile.escalation_rules_json,
    guardrails: profile.guardrails_json,
    metadata: profile.metadata_json
  });
  const industryContext = await getIndustryKnowledgeContext({
    tenantId,
    brandId: profile.brand_id,
    categories: ["intake", "qualification", "scheduling", "safety", "follow_up"]
  });
  const systemPrompt = buildVoiceAgentSystemPrompt(businessProfile, industryContext);
  const maxDurationSeconds = await getVoiceMaxDurationSeconds(tenantId, providerKey);

  const phoneConnection = await getPhoneConnection(tenantId);
  const transferDestinations = await listHumanTransferDestinations(tenantId, profile.brand_id);
  if (!transferDestinations.length && phoneConnection?.humanTransferNumber) {
    transferDestinations.push({
      label: "Primary human", role: "general", phoneNumber: phoneConnection.humanTransferNumber,
      priority: 100, weekdays: [0, 1, 2, 3, 4, 5, 6], availableStart: null,
      availableEnd: null, timezone: "America/Chicago", isPrimary: true
    });
  }
  const sharedConfig = {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }]
    },
    server: { url: `${appUrl}/api/integrations/voice-ai/webhook` },
    serverMessages: ["status-update", "end-of-call-report", "transcript"],
    maxDurationSeconds,
    transferNumber: phoneConnection?.humanTransferNumber ?? null,
    transferDestinations,
    metadata: { profileSource: "ferocity_office_manager", industryModule: industryContext?.moduleKey ?? null }
  };
  const result = await adapter.createOrUpdateAssistant(
    {
      tenantId,
      brandId: profile.brand_id,
      correlationId: `voice-assistant:${providerKey}:${tenantId}`,
      idempotencyKey: `voice-assistant:${providerKey}:${tenantId}:${profile.brand_id ?? "workspace"}`,
      liveActionsEnabled: false
    },
    {
      assistantId: profile.assistant_id,
      name: businessProfile.displayName,
      firstMessage: businessProfile.greeting,
      ...sharedConfig
    }
  );

  if (!result.ok) {
    await queryPostgres(
      `
      update public.provider_accounts
      set status = 'error', live_actions_enabled = false,
          metadata_json = metadata_json || $2::jsonb, updated_at = now()
      where tenant_id = $1 and provider_key = $3
      `,
      [
        tenantId,
        JSON.stringify({ assistantSyncError: result.safeMessage, assistantSyncAt: new Date().toISOString() }),
        providerKey
      ]
    );
    revalidatePath("/app/receptionist-setup");
    return;
  }

  const outboundResult = await adapter.createOrUpdateAssistant(
    {
      tenantId, brandId: profile.brand_id,
      correlationId: `voice-outbound-assistant:${providerKey}:${tenantId}`,
      idempotencyKey: `voice-outbound-assistant:${providerKey}:${tenantId}:${profile.brand_id ?? "workspace"}`,
      liveActionsEnabled: false
    },
    {
      assistantId: profile.outbound_assistant_id,
      name: `${businessProfile.displayName} Outbound`,
      firstMessage: "Hello, this is the business calling through Ferocity. Is now an okay time to talk?",
      ...sharedConfig
    }
  );
  if (!outboundResult.ok) {
    await queryPostgres(
      `update public.provider_accounts set status='error',live_actions_enabled=false,
       metadata_json=metadata_json || $2::jsonb,updated_at=now() where tenant_id=$1 and provider_key=$3`,
      [tenantId, JSON.stringify({ outboundAssistantSyncError: outboundResult.safeMessage, assistantSyncAt: new Date().toISOString() }), providerKey]
    );
    revalidatePath("/app/receptionist-setup");
    return;
  }

  await queryPostgres(
    `
    update public.provider_accounts
    set metadata_json = metadata_json || $2::jsonb, updated_at = now()
    where tenant_id = $1 and provider_key = $3
    `,
    [
      tenantId,
      JSON.stringify({
        assistantId: result.data.assistantId,
        outboundAssistantId: outboundResult.data.assistantId,
        assistantStatus: result.data.status,
        assistantSyncedAt: new Date().toISOString(),
        transferNumber: phoneConnection?.humanTransferNumber ?? null,
        publishedProfileVersion: await latestVoiceProfileVersion(tenantId, profile.brand_id)
      }),
      providerKey
    ]
  );
  await queryPostgres(
    `
    update public.office_manager_channel_configs
    set provider_key = $3, status = 'ready', inbound_enabled = true,
        setup_notes = 'The selected voice assistant is synchronized. Activate only after a successful test call and fallback review.',
        metadata_json = metadata_json || $2::jsonb, updated_at = now()
    where tenant_id = $1 and channel_key = 'phone'
    `,
    [
      tenantId,
      JSON.stringify({ assistantId: result.data.assistantId, syncedAt: new Date().toISOString() }),
      providerKey
    ]
  );

  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/office-manager");
}

export async function placeVoiceTestCallAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = testCallSchema.safeParse({
    providerKey: formData.get("providerKey"),
    toNumber: formData.get("toNumber"),
    consentConfirmed: formData.get("consentConfirmed")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const adapter = getVoiceAgentProvider(parsed.data.providerKey);
  if (!adapter || adapter.adapterStatus !== "live") return;
  const connection = await adapter.getConnection(
    {
      tenantId,
      correlationId: `voice-connection:${parsed.data.providerKey}:${tenantId}`,
      idempotencyKey: `voice-connection:${parsed.data.providerKey}:${tenantId}`,
      liveActionsEnabled: false,
      purpose: "authorized_test"
    },
    false
  );
  if (!connection.ok) return;

  const accountResult = await queryPostgres<{
    assistant_id: string | null;
    brand_id: string | null;
  }>(
    `
    select nullif(a.metadata_json->>'assistantId', '') as assistant_id, p.brand_id
    from public.provider_accounts a
    left join public.office_manager_profiles p
      on p.tenant_id = a.tenant_id and p.status in ('ready', 'active', 'needs_attention')
    where a.tenant_id = $1 and a.provider_key = $2
    order by p.updated_at desc nulls last
    limit 1
    `,
    [tenantId, parsed.data.providerKey]
  );
  const account = accountResult?.rows[0];
  if (!account?.assistant_id) return;
  const idempotencyKey = `voice-test:${parsed.data.providerKey}:${tenantId}:${crypto.randomUUID()}`;
  const voiceAgent = new ProviderBackedVoiceAgent(adapter);
  const result = await voiceAgent.startConversation(
    {
      tenantId,
      brandId: account.brand_id,
      correlationId: idempotencyKey,
      idempotencyKey,
      liveActionsEnabled: false,
      purpose: "authorized_test"
    },
    {
      toNumber: parsed.data.toNumber,
      fromNumber: connection.data.phoneNumber,
      assistantId: account.assistant_id
    }
  );
  if (!result.ok) {
    await queryPostgres(
      `
      update public.provider_accounts
      set metadata_json = metadata_json || $2::jsonb, updated_at = now()
      where tenant_id = $1 and provider_key = $3
      `,
      [
        tenantId,
        JSON.stringify({ testCallError: result.safeMessage, testCallAt: new Date().toISOString() }),
        parsed.data.providerKey
      ]
    );
    revalidatePath("/app/receptionist-setup");
    return;
  }
  const providerCallId = result.data.providerCallId ?? result.data.conversationId;

  await queryPostgres(
    `
    insert into public.receptionist_calls (
      tenant_id, brand_id, telephony_number_id, provider_key, provider_call_id,
      direction, caller_number, called_number, status, outcome, sentiment,
      lead_qualification, summary, follow_up_status, usage_units, idempotency_key, metadata_json
    )
    values (
      $1, $2,
      (select id from public.telephony_numbers
       where tenant_id = $1 and provider_key = $8 and phone_number = $3 limit 1),
      $8, $4, 'outbound', $3, $5, 'ringing', null, 'unknown',
      'unknown', 'Authorized voice-provider test call started.', 'none', 0, $6, $7::jsonb
    )
    on conflict (provider_key, provider_call_id) do update
    set brand_id=coalesce(public.receptionist_calls.brand_id,excluded.brand_id),
        telephony_number_id=coalesce(public.receptionist_calls.telephony_number_id,excluded.telephony_number_id),
        caller_number=coalesce(public.receptionist_calls.caller_number,excluded.caller_number),
        called_number=coalesce(public.receptionist_calls.called_number,excluded.called_number),
        summary=coalesce(public.receptionist_calls.summary,excluded.summary),
        metadata_json=public.receptionist_calls.metadata_json || excluded.metadata_json,
        updated_at=now()
    `,
    [
      tenantId,
      account.brand_id,
      connection.data.phoneNumber,
      providerCallId,
      parsed.data.toNumber,
      idempotencyKey,
      JSON.stringify({
        source: "receptionist_setup_test",
        consentConfirmed: true
      }),
      parsed.data.providerKey
    ]
  );
  await queryPostgres(
    `
    update public.receptionist_setup_checklists
    set test_status = 'in_progress', activation_status = 'not_started', updated_at = now()
    where tenant_id = $1
    `,
    [tenantId]
  );
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/calls");
}

async function latestVoiceProfileVersion(tenantId: string, brandId: string | null) {
  const result = await queryPostgres<{ version_number: number }>(
    `select v.version_number from public.voice_agent_profile_versions v
     join public.office_manager_profiles p on p.id=v.profile_id
     where v.tenant_id=$1 and ($2::uuid is null or p.brand_id=$2)
     order by v.version_number desc limit 1`,
    [tenantId, brandId]
  );
  return result?.rows[0]?.version_number ?? null;
}

export async function activateVoiceAssistantAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = activateVoiceSchema.safeParse({ providerKey: formData.get("providerKey") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const readiness = await queryPostgres<{ ready: boolean }>(
    `select (
       exists(select 1 from public.receptionist_setup_checklists where tenant_id=$1 and test_status='complete')
       and exists(select 1 from public.provider_accounts where tenant_id=$1 and provider_key=$2 and status <> 'error'
         and nullif(metadata_json->>'assistantId','') is not null
         and nullif(metadata_json->>'lastSuccessfulTestCallAt','') is not null)
       and exists(select 1 from public.telephony_numbers where tenant_id=$1 and provider_key=$2 and status='active' and inbound_enabled)
     ) as ready`,
    [tenantId, parsed.data.providerKey]
  );
  if (!readiness?.rows[0]?.ready) return;
  await queryPostgres(
    `update public.provider_accounts set live_actions_enabled=true,status='connected',updated_at=now()
     where tenant_id=$1 and provider_key=$2`,
    [tenantId, parsed.data.providerKey]
  );
  await queryPostgres(
    `update public.voice_provider_routes set live_actions_enabled=true,status='active',updated_at=now()
     where tenant_id=$1 and route_family='voice_orchestrator' and primary_provider_key=$2`,
    [tenantId, parsed.data.providerKey]
  );
  await queryPostgres(
    `update public.office_manager_channel_configs set status='active',live_actions_enabled=true,
       setup_notes='Voice is active after a successful certified test call.',updated_at=now()
     where tenant_id=$1 and channel_key='phone' and provider_key=$2`,
    [tenantId, parsed.data.providerKey]
  );
  await queryPostgres(
    `update public.receptionist_setup_checklists set status='active',activation_status='complete',updated_at=now()
     where tenant_id=$1`,
    [tenantId]
  );
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/office-manager");
}
