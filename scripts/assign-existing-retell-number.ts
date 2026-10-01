import { queryPostgres, withPostgresTransaction } from "../src/lib/db/postgres";
import { getIndustryKnowledgeContext } from "../src/lib/industry-knowledge/get-industry-context";
import { buildVoiceAgentSystemPrompt, voiceProfileFromStored } from "../src/lib/phone/voice-agent-profile";
import { getVoiceAgentProvider } from "../src/lib/providers/voice-adapters";
import { getVoiceMaxDurationSeconds } from "../src/lib/usage/managed-voice";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const targetSlug = argument("tenant");
  const phoneNumber = argument("number");
  const transferNumber = argument("transfer");
  const execute = process.argv.includes("--execute");
  if (!targetSlug || !phoneNumber || !transferNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber) || !/^\+[1-9]\d{7,14}$/.test(transferNumber)) {
    throw new Error("Use --tenant <slug> --number <E.164 number> --transfer <E.164 number> [--execute].");
  }

  const result = await queryPostgres<{
    tenant_id: string; tenant_name: string; account_type: string; brand_id: string;
    source_tenant_id: string; source_brand_id: string | null; source_tenant_name: string;
  }>(
    `select t.id tenant_id,t.name tenant_name,t.account_type,b.id brand_id,
            n.tenant_id source_tenant_id,n.brand_id source_brand_id,st.name source_tenant_name
       from public.tenants t
       join public.brands b on b.tenant_id=t.id and b.status='active'
       join public.telephony_numbers n on n.phone_number=$2 and n.provider_key='retell_voice' and n.status<>'released'
       join public.tenants st on st.id=n.tenant_id
      where t.slug=$1
      order by b.created_at limit 1`,
    [targetSlug, phoneNumber]
  );
  const target = result?.rows[0];
  if (!target) throw new Error("The target workspace, active brand, or existing Retell number was not found.");
  if (target.source_tenant_id === target.tenant_id) throw new Error("That number is already assigned to the target workspace.");
  const existing = await queryPostgres<{ phone_number: string }>(
    `select phone_number from public.telephony_numbers where tenant_id=$1 and provider_key='retell_voice' and status<>'released' limit 1`,
    [target.tenant_id]
  );
  if (existing?.rows[0]) throw new Error("The target workspace already has an active or retained Retell number.");
  if (!execute) {
    console.log(JSON.stringify({ ok: true, action: "preflight", target: target.tenant_name, source: target.source_tenant_name, phoneNumber, transferNumber }, null, 2));
    return;
  }

  const profile = await withPostgresTransaction(async (client) => {
    const inserted = await client.query<{
      id: string; display_name: string; role_summary: string; default_tone: string;
      escalation_rules_json: unknown; guardrails_json: unknown; metadata_json: unknown;
    }>(
      `insert into public.office_manager_profiles (
         tenant_id,brand_id,status,display_name,role_summary,default_tone,autonomy_mode,
         interruption_style,escalation_rules_json,industry_playbooks_json,guardrails_json,memory_rules_json,metadata_json
       ) values ($1,$2,'ready',$3,$4,'warm, capable, concise, and natural','approval_required','natural',$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb)
       on conflict (tenant_id,brand_id) do update set status='ready',updated_at=now()
       returning id,display_name,role_summary,default_tone,escalation_rules_json,guardrails_json,metadata_json`,
      [target.tenant_id,target.brand_id,`${target.tenant_name} Office Manager`,
       `AI receptionist for ${target.tenant_name}. Handle routine questions, capture complete requests, and transfer callers to the verified business owner when requested or required.`,
       JSON.stringify(["Transfer promptly when the caller requests a person or the request is urgent, sensitive, or outside verified information."]),
       JSON.stringify(["Never invent services, prices, availability, warranties, or business policies.","Do not claim setup is complete when business details have not been supplied."]),
       JSON.stringify(["general_business","professional_services","local_service"]),
       JSON.stringify(["Use only useful, reviewable caller history and confirmed business facts."]),
       JSON.stringify({ source: "managed_number_assignment", voiceGreeting: `Thank you for calling ${target.tenant_name}. How can I help you today?`, voiceLanguages: ["English"] })]
    );
    await client.query(
      `insert into public.provider_accounts (tenant_id,provider_key,display_name,status,credentials_status,live_actions_enabled,ownership_mode,metadata_json)
       values ($1,'retell_voice','Ferocity-managed Retell','connected','configured',true,'ferocity_managed',$2::jsonb)
       on conflict (tenant_id,provider_key) do update set status='connected',credentials_status='configured',live_actions_enabled=true,
         ownership_mode='ferocity_managed',metadata_json=public.provider_accounts.metadata_json||excluded.metadata_json,updated_at=now()`,
      [target.tenant_id, JSON.stringify({ purpose: "customer_managed_number", transferNumber })]
    );
    await client.query(
      `update public.telephony_numbers set tenant_id=$2,brand_id=$3,display_name=$4,status='provisioning',
         inbound_enabled=false,outbound_enabled=false,callback_status='untested',callback_last_tested_at=null,
         routing_json=jsonb_build_object('inboundWebhookUrl',$5::text,'humanTransferNumber',$6::text),
         metadata_json=metadata_json||$7::jsonb,updated_at=now()
       where phone_number=$1 and tenant_id=$8`,
      [phoneNumber,target.tenant_id,target.brand_id,`${target.tenant_name} phone`,
       "https://ferocity.live/api/integrations/voice-ai/inbound",transferNumber,
       JSON.stringify({ reassignedFromTenantId: target.source_tenant_id, reassignedAt: new Date().toISOString(), assignmentSource: "founder_approved_existing_number" }),target.source_tenant_id]
    );
    await client.query(
      `update public.phone_connections set ferocity_number=null,status='needs_attention',
         setup_json=setup_json||$3::jsonb,updated_at=now() where tenant_id=$1 and ferocity_number=$2`,
      [target.source_tenant_id,phoneNumber,JSON.stringify({ numberReassignedToTenantId: target.tenant_id, numberReassignedAt: new Date().toISOString() })]
    );
    await client.query(
      `insert into public.phone_connections (tenant_id,brand_id,connection_path,ferocity_number,phone_provider_key,phone_provider_label,
         voice_agent_provider_key,preferred_area_code,intended_use,human_transfer_number,status,capabilities_json,setup_json)
       values ($1,$2,'new_ferocity_number',$3,'retell_voice','Ferocity-managed Retell','retell_voice',$4,
         'Dedicated customer receptionist and approved business calls',$5,'testing',$6::jsonb,$7::jsonb)
       on conflict (tenant_id) do update set brand_id=excluded.brand_id,ferocity_number=excluded.ferocity_number,
         phone_provider_key='retell_voice',phone_provider_label='Ferocity-managed Retell',voice_agent_provider_key='retell_voice',
         human_transfer_number=excluded.human_transfer_number,status='testing',capabilities_json=excluded.capabilities_json,
         setup_json=public.phone_connections.setup_json||excluded.setup_json,updated_at=now()`,
      [target.tenant_id,target.brand_id,phoneNumber,phoneNumber.slice(2,5),transferNumber,
       JSON.stringify(["inbound_call","outbound_call","call_transfer","voicemail","recording","business_hours","multi_user"]),
       JSON.stringify({ managedNumberProvisioningApproved: true, existingNumberReassigned: true, callbackCertificationRequired: true })]
    );
    return inserted.rows[0];
  });
  if (!profile) throw new Error("The managed-number assignment transaction did not complete.");

  const adapter = getVoiceAgentProvider("retell_voice");
  if (!adapter || adapter.adapterStatus !== "live") throw new Error("The Retell adapter is not live.");
  const [industryContext,maxDurationSeconds] = await Promise.all([
    getIndustryKnowledgeContext({ tenantId: target.tenant_id, brandId: target.brand_id, categories: ["intake","qualification","scheduling","safety","follow_up"] }),
    getVoiceMaxDurationSeconds(target.tenant_id,"retell_voice")
  ]);
  const businessProfile = voiceProfileFromStored({
    displayName: profile.display_name, roleSummary: profile.role_summary, tone: profile.default_tone,
    escalationRules: profile.escalation_rules_json, guardrails: profile.guardrails_json, metadata: profile.metadata_json
  });
  const sharedConfig = {
    model: { provider: "openai", model: "gpt-4.1-mini", messages: [{ role: "system", content: buildVoiceAgentSystemPrompt(businessProfile,industryContext) }] },
    server: { url: "https://ferocity.live/api/integrations/voice-ai/webhook" },
    serverMessages: ["status-update","end-of-call-report","transcript"], maxDurationSeconds, transferNumber,
    metadata: { profileSource: "ferocity_office_manager", purpose: "customer_managed_number" }
  };
  const context = { tenantId: target.tenant_id, brandId: target.brand_id, correlationId: `assign-existing-number:${target.tenant_id}`,
    idempotencyKey: `assign-existing-number:${target.tenant_id}`, liveActionsEnabled: false, purpose: "authorized_test" as const };
  const inbound = await adapter.createOrUpdateAssistant(context,{ name: businessProfile.displayName, firstMessage: businessProfile.greeting, ...sharedConfig });
  if (!inbound.ok) throw new Error(inbound.safeMessage);
  const outbound = await adapter.createOrUpdateAssistant(
    { ...context, correlationId: `${context.correlationId}:outbound`, idempotencyKey: `${context.idempotencyKey}:outbound` },
    { name: `${businessProfile.displayName} Outbound`, firstMessage: `Hello, this is ${target.tenant_name} calling through Ferocity. Is now an okay time to talk?`, ...sharedConfig }
  );
  if (!outbound.ok) throw new Error(outbound.safeMessage);
  const bound = await adapter.verifyConnection(context,{ assistantId: inbound.data.assistantId, webhookUrl: "https://ferocity.live/api/integrations/voice-ai/webhook", inboundWebhookUrl: "https://ferocity.live/api/integrations/voice-ai/inbound" });
  if (!bound.ok) throw new Error(bound.safeMessage);

  await withPostgresTransaction(async (client) => {
    await client.query(
      `update public.integration_connections
          set status='connected', credentials_status='configured', last_checked_at=now(),
              metadata_json=metadata_json||$2::jsonb, updated_at=now()
        where tenant_id=$1 and provider='voice_ai'`,
      [target.tenant_id,JSON.stringify({ managedProvider: "retell_voice", managedNumber: phoneNumber, liveActionsEnabled: true })]
    );
    await client.query(
      `update public.provider_accounts set metadata_json=metadata_json||$2::jsonb,updated_at=now() where tenant_id=$1 and provider_key='retell_voice'`,
      [target.tenant_id,JSON.stringify({ assistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId,
        assistantStatus: "configured", assistantSyncedAt: new Date().toISOString(), phoneNumber, transferNumber })]
    );
    await client.query(
      `insert into public.office_manager_channel_configs (tenant_id,brand_id,profile_id,channel_key,provider_key,status,inbound_enabled,
         outbound_enabled,live_actions_enabled,approval_mode,setup_notes,metadata_json)
       values ($1,$2,$3,'phone','retell_voice','ready',true,false,false,'approval_required',$4,$5::jsonb)
       on conflict (tenant_id,brand_id,channel_key) do update set profile_id=excluded.profile_id,provider_key='retell_voice',status='ready',
         inbound_enabled=true,outbound_enabled=false,live_actions_enabled=false,setup_notes=excluded.setup_notes,
         metadata_json=public.office_manager_channel_configs.metadata_json||excluded.metadata_json,updated_at=now()`,
      [target.tenant_id,target.brand_id,profile.id,"Dedicated number and transfer are ready; outbound remains gated until callback certification.",
       JSON.stringify({ assistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId, phoneNumber, transferNumber })]
    );
    await client.query(
      `update public.telephony_numbers set status='active',inbound_enabled=true,outbound_enabled=false,compliance_status='ready',
         routing_json=routing_json||$2::jsonb,metadata_json=metadata_json||$3::jsonb,activated_at=coalesce(activated_at,now()),updated_at=now()
       where tenant_id=$1 and phone_number=$4`,
      [target.tenant_id,JSON.stringify({ inboundWebhookUrl: "https://ferocity.live/api/integrations/voice-ai/inbound", humanTransferNumber: transferNumber }),
       JSON.stringify({ assistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId }),phoneNumber]
    );
  });
  console.log(JSON.stringify({ ok: true, tenant: target.tenant_name, phoneNumber, transferNumber,
    inboundAssistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId,
    inboundReady: true, outboundEnabled: false, callbackCertificationRequired: true }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
