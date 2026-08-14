"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getIndustryKnowledgeContext } from "@/lib/industry-knowledge/get-industry-context";
import { listPhoneProviders } from "@/lib/phone/provider-registry";
import { getPhoneConnection, savePhoneConnection } from "@/lib/phone/phone-connections";
import { ProviderBackedVoiceAgent } from "@/lib/phone/voice-agent";
import {
  buildVoiceAgentSystemPrompt,
  voiceProfileFromStored
} from "@/lib/phone/voice-agent-profile";
import { getVoiceAgentProvider } from "@/lib/providers/voice-adapters";
import { getVoiceMaxDurationSeconds } from "@/lib/usage/managed-voice";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const voiceProviderSchema = z.string().trim().min(2).max(120);

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
  mmsRequested: z.boolean()
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
    mmsRequested: formData.get("mmsRequested") === "true"
  });
  if (!parsed.success) return;
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
  await savePhoneConnection({
    tenantId,
    connectionPath: parsed.data.connectionPath,
    businessNumber: parsed.data.businessNumber,
    currentCarrier: parsed.data.currentCarrier,
    fullIntegrationMethod: parsed.data.fullIntegrationMethod ?? null,
    preferredAreaCode: parsed.data.preferredAreaCode,
    intendedUse: parsed.data.intendedUse,
    humanTransferNumber: parsed.data.humanTransferNumber,
    smsRequested: parsed.data.smsRequested,
    mmsRequested: parsed.data.mmsRequested,
    phoneProviderKey: parsed.data.connectionPath === "bring_own_provider"
      ? parsed.data.phoneProviderKey
      : null,
    phoneProviderLabel: parsed.data.connectionPath === "bring_own_provider"
      ? providerLabel
      : null
  });
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/office-manager");
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
  const adapter = getVoiceAgentProvider(provider.data);
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
    [tenantId, provider.data]
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
  const maxDurationSeconds = await getVoiceMaxDurationSeconds(tenantId, provider.data);

  const phoneConnection = await getPhoneConnection(tenantId);
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
    metadata: { profileSource: "ferocity_office_manager", industryModule: industryContext?.moduleKey ?? null }
  };
  const result = await adapter.createOrUpdateAssistant(
    {
      tenantId,
      brandId: profile.brand_id,
      correlationId: `voice-assistant:${provider.data}:${tenantId}`,
      idempotencyKey: `voice-assistant:${provider.data}:${tenantId}:${profile.brand_id ?? "workspace"}`,
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
        provider.data
      ]
    );
    revalidatePath("/app/receptionist-setup");
    return;
  }

  const outboundResult = await adapter.createOrUpdateAssistant(
    {
      tenantId, brandId: profile.brand_id,
      correlationId: `voice-outbound-assistant:${provider.data}:${tenantId}`,
      idempotencyKey: `voice-outbound-assistant:${provider.data}:${tenantId}:${profile.brand_id ?? "workspace"}`,
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
      [tenantId, JSON.stringify({ outboundAssistantSyncError: outboundResult.safeMessage, assistantSyncAt: new Date().toISOString() }), provider.data]
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
        assistantSyncedAt: new Date().toISOString()
      }),
      provider.data
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
      provider.data
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
    on conflict (provider_key, provider_call_id) do nothing
    `,
    [
      tenantId,
      account.brand_id,
      connection.data.phoneNumber,
      providerCallId,
      parsed.data.toNumber,
      idempotencyKey,
      JSON.stringify({ source: "receptionist_setup_test", consentConfirmed: true }),
      parsed.data.providerKey
    ]
  );
  await queryPostgres(
    `
    update public.receptionist_setup_checklists
    set test_status = 'complete', updated_at = now()
    where tenant_id = $1
    `,
    [tenantId]
  );
  revalidatePath("/app/receptionist-setup");
  revalidatePath("/app/calls");
}
