import pg from "pg";
import { buildVoiceAgentSystemPrompt, type VoiceAgentBusinessProfile } from "../src/lib/phone/voice-agent-profile";
import { configureRetellManagedNumber } from "../src/lib/phone/retell-managed-number-provider";
import { getVoiceAgentProvider } from "../src/lib/providers/voice-adapters";
import { resolveRetellConfiguration } from "../src/lib/providers/retell-config";

const { Client } = pg;
const APP_URL = (process.env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
const PROVIDER_KEY = "retell_voice";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}
function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function suffix(phoneNumber: string | null | undefined) {
  const digits = phoneNumber?.replace(/\D/g, "") ?? "";
  return digits ? `***${digits.slice(-4)}` : null;
}
function optionalE164(value: string | null) {
  if (!value) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error("--transfer must be an E.164 number.");
  return value;
}

type TransferContext = {
  targetTenantId: string;
  targetTenantName: string;
  brandId: string | null;
  sourceTenantId: string;
  sourceTenantName: string;
  sourceNumberId: string;
  phoneNumber: string;
  providerResourceId: string | null;
  sourceNumberStatus: string;
  sourceInboundEnabled: boolean;
  sourceOutboundEnabled: boolean;
  sourcePhoneConnectionStatus: string | null;
  sourcePhoneConnectionNumber: string | null;
  existingTargetNumbers: number;
  historicalCalls: number;
};

async function loadContext(client: pg.Client, input: { targetTenantId: string; sourceTenantName: string; numberLast4: string }) {
  const result = await client.query<TransferContext>(
    `select target.id "targetTenantId",target.name "targetTenantName",brand.id "brandId",
            source.id "sourceTenantId",source.name "sourceTenantName",source_number.id "sourceNumberId",
            source_number.phone_number "phoneNumber",source_number.provider_resource_id "providerResourceId",
            source_number.status "sourceNumberStatus",source_number.inbound_enabled "sourceInboundEnabled",
            source_number.outbound_enabled "sourceOutboundEnabled",source_connection.status "sourcePhoneConnectionStatus",
            source_connection.ferocity_number "sourcePhoneConnectionNumber",
            (select count(*)::int from public.telephony_numbers n where n.tenant_id=target.id and n.provider_key=$4 and n.status<>'released') "existingTargetNumbers",
            (select count(*)::int from public.receptionist_calls c where c.telephony_number_id=source_number.id) "historicalCalls"
       from public.tenants target
       join public.tenants source on lower(source.name)=lower($2)
       join public.telephony_numbers source_number on source_number.tenant_id=source.id and source_number.provider_key=$4
        and right(regexp_replace(source_number.phone_number,'\\D','','g'),4)=$3 and source_number.status<>'released'
       left join public.phone_connections source_connection on source_connection.tenant_id=source.id
       left join public.brands brand on brand.tenant_id=target.id and brand.slug='diamond-homes'
      where target.id=$1 limit 1`,
    [input.targetTenantId, input.sourceTenantName, input.numberLast4, PROVIDER_KEY]
  );
  const row = result.rows[0];
  if (!row) throw new Error("The source workspace or retained Retell number could not be identified uniquely.");
  return row;
}

async function readRetellNumber(apiKey: string, phoneNumber: string) {
  const response = await fetch(`https://api.retellai.com/get-phone-number/${encodeURIComponent(phoneNumber)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(`Retell number lookup failed with HTTP ${response.status}.`);
  return body ?? {};
}
function assistantIds(number: Record<string, unknown>, key: "inbound_agents" | "outbound_agents") {
  const agents = Array.isArray(number[key]) ? number[key] as Array<Record<string, unknown>> : [];
  return agents.map((agent) => String(agent.agent_id ?? "")).filter(Boolean);
}

async function ensureDiamondBrand(client: pg.Client, tenantId: string) {
  await client.query("begin");
  try {
    const brand = await client.query<{ id: string }>(
      `insert into public.brands (tenant_id,name,slug,business_model,industry,vertical,description,primary_goal,primary_location,risk_profile,status)
       values ($1,'Diamond Homes','diamond-homes','local_service','Facility maintenance and property services','National facility maintenance network',
         'Facility maintenance coordination, contractor sourcing, vendor relationships, and property-service operations.',
         'Qualify opportunities, establish reliable local coverage, and coordinate approved work without losing audit or approval boundaries.',
         'Wisconsin with St. Louis coverage development','normal','active')
       on conflict (tenant_id,slug) do update set name=excluded.name,business_model=excluded.business_model,
         industry=excluded.industry,vertical=excluded.vertical,description=excluded.description,primary_goal=excluded.primary_goal,
         primary_location=excluded.primary_location,status='active',updated_at=now() returning id`,
      [tenantId]
    );
    const brandId = brand.rows[0]?.id;
    if (!brandId) throw new Error("Diamond Homes brand creation did not return an id.");
    const services = [
      ["Facility maintenance opportunity intake", "Capture the client, site, trade, scope, deadline, budget, and credential requirements.", 100],
      ["Contractor and vendor recruiting", "Capture trade coverage, geography, availability, insurance, licensing, capacity, and follow-up needs.", 90],
      ["Job coordination", "Provide verified status and tracked follow-up; never accept binding work without authorization.", 80],
      ["Vendor application coordination", "Track portals, requirements, status, payment terms, and follow-up dates.", 70]
    ] as const;
    for (const [name, description, priority] of services) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await client.query(
        `insert into public.brand_services (tenant_id,brand_id,name,slug,description,priority,active)
         values ($1,$2,$3,$4,$5,$6,true) on conflict (brand_id,slug) do update set
         name=excluded.name,description=excluded.description,priority=excluded.priority,active=true`,
        [tenantId, brandId, name, slug, description, priority]
      );
    }
    for (const area of [
      { city: null, state: "WI", label: "Wisconsin", priority: 100 },
      { city: "St. Louis", state: "MO", label: "St. Louis, Missouri", priority: 90 },
      { city: null, state: null, label: "Nationwide recruiting", priority: 50 }
    ]) {
      await client.query(
        `insert into public.brand_locations (tenant_id,brand_id,city,state,service_area_name,priority,active)
         select $1,$2,$3,$4,$5,$6,true where not exists (
           select 1 from public.brand_locations where tenant_id=$1 and brand_id=$2 and service_area_name=$5)`,
        [tenantId, brandId, area.city, area.state, area.label, area.priority]
      );
    }
    await client.query("commit");
    return brandId;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

const diamondProfile: VoiceAgentBusinessProfile = {
  displayName: "Diamond Homes Operations",
  roleSummary: "You answer Diamond Homes calls for facility-management vendor relationships, contractor recruiting, maintenance opportunities, job coordination, and general business intake.",
  tone: "professional, direct, warm, and operationally precise",
  greeting: "Thank you for calling Diamond Homes. How can I help you today?",
  languages: ["English", "Spanish when the caller prefers Spanish"],
  callGoals: [
    "Identify whether the caller is a facility-management prospect, contractor, client, site contact, or other business contact.",
    "For opportunities, capture company, site address, trade, scope, priority, deadline, budget, credential requirements, and requested next step.",
    "For contractors, capture service area, trades, availability, capacity, insurance and license status, rates when offered, and willingness to travel.",
    "Create a complete tracked follow-up when the request needs a person or a system decision."
  ],
  customInstructions: [
    "An opportunity is not an accepted job. Keep received, recruiting, contractor identified, contractor confirmed, job accepted, dispatched, completed, verified, and closed distinct.",
    "MarketplacePro owns contractor sourcing, qualification, and matching. Ferocity owns accepted operational work, dispatch, scheduling, billing, and job financials.",
    "Never claim a vendor application is approved until confirmation is recorded.",
    "Never automatically post to Facebook, send bulk recruitment messages, or import private conversations."
  ],
  escalationRules: [
    "Escalate binding work-order acceptance, customer pricing commitments, payment changes, credential exceptions, complaints, safety issues, and legal or insurance representations.",
    "Escalate when the caller asks for a person or verified information is insufficient for a safe answer."
  ],
  guardrails: [
    "Do not accept or dispatch binding work, promise coverage, quote an unverified rate, approve a contractor, or disclose private contractor documents.",
    "Do not request passwords, verification codes, full card numbers, Social Security numbers, banking credentials, or private Facebook credentials.",
    "Do not say an action succeeded unless a signed Ferocity tool confirms it."
  ]
};

async function prepareAssistant(input: { tenantId: string; brandId: string; existingAssistantId: string | null; transferNumber: string | null }) {
  const adapter = getVoiceAgentProvider(PROVIDER_KEY);
  if (!adapter || adapter.adapterStatus !== "live") throw new Error("The Retell adapter is not live.");
  const result = await adapter.createOrUpdateAssistant(
    { tenantId: input.tenantId, brandId: input.brandId, correlationId: `diamond-homes-line-transfer:${input.brandId}`,
      idempotencyKey: `diamond-homes-line-transfer:${input.brandId}`, liveActionsEnabled: false, purpose: "authorized_test" },
    { assistantId: input.existingAssistantId, name: diamondProfile.displayName, firstMessage: diamondProfile.greeting,
      model: { provider: "openai", model: "gpt-4.1-mini", messages: [{ role: "system", content: buildVoiceAgentSystemPrompt(diamondProfile, null) }] },
      server: { url: `${APP_URL}/api/integrations/voice-ai/webhook` }, transferNumber: input.transferNumber,
      maxDurationSeconds: 1200, metadata: { purpose: "diamond_homes_vendor_network" } }
  );
  if (!result.ok) throw new Error(result.safeMessage);
  return result.data.assistantId;
}

async function stageDatabaseTransfer(client: pg.Client, context: TransferContext, brandId: string, assistantId: string) {
  const transferredAt = new Date().toISOString();
  await client.query("begin");
  try {
    await client.query(
      `update public.telephony_numbers set provider_resource_id=null,status='released',inbound_enabled=false,outbound_enabled=false,
       released_at=coalesce(released_at,now()),metadata_json=metadata_json||$2::jsonb,updated_at=now()
       where id=$1 and tenant_id=$3 and status<>'released'`,
      [context.sourceNumberId, JSON.stringify({ transferredToTenantId: context.targetTenantId, transferredToBrandId: brandId,
        transferredAt, transferReason: "founder_authorized_diamond_homes_operations" }), context.sourceTenantId]
    );
    const targetNumber = await client.query<{ id: string }>(
      `insert into public.telephony_numbers (tenant_id,brand_id,provider_key,number_mode,phone_number,display_name,
       provider_resource_id,status,inbound_enabled,outbound_enabled,recording_default_enabled,transcript_default_enabled,
       compliance_status,routing_json,metadata_json)
       values ($1,$2,$3,'ferocity_managed',$4,'Diamond Homes operations',$5,'provisioning',false,false,false,true,'ready',$6::jsonb,$7::jsonb)
       on conflict (tenant_id,phone_number) do update set brand_id=excluded.brand_id,provider_key=excluded.provider_key,
       number_mode='ferocity_managed',display_name=excluded.display_name,provider_resource_id=excluded.provider_resource_id,
       status='provisioning',inbound_enabled=false,outbound_enabled=false,compliance_status='ready',routing_json=excluded.routing_json,
       metadata_json=public.telephony_numbers.metadata_json||excluded.metadata_json,updated_at=now() returning id`,
      [context.targetTenantId, brandId, PROVIDER_KEY, context.phoneNumber, context.providerResourceId ?? context.phoneNumber,
       JSON.stringify({ inboundWebhookUrl: `${APP_URL}/api/integrations/voice-ai/inbound`, eventWebhookUrl: `${APP_URL}/api/integrations/voice-ai/webhook`,
         intentProfile: "diamond_homes_vendor_network_v1",
         allowedIntents: ["facility_vendor_relations", "contractor_recruiting", "maintenance_opportunity_intake", "job_coordination", "billing_status", "general_business"],
         approvalRequiredFor: ["binding_work_order", "price_commitment", "payment_change", "credential_exception", "complaint", "safety", "legal_or_insurance_representation"] }),
       JSON.stringify({ assistantId, assignmentSource: "founder_authorized_existing_number_transfer", transferredFromTenantId: context.sourceTenantId,
         transferredAt, historicalSourceNumberId: context.sourceNumberId })]
    );
    await client.query(
      `update public.phone_connections set ferocity_number=null,status='paused',setup_json=setup_json||$2::jsonb,updated_at=now()
       where tenant_id=$1 and ferocity_number=$3`,
      [context.sourceTenantId, JSON.stringify({ numberTransferredToTenantId: context.targetTenantId, numberTransferredToBrandId: brandId,
        numberTransferredAt: transferredAt }), context.phoneNumber]
    );
    await client.query(
      `update public.phone_connections set setup_json=jsonb_set(setup_json,'{additionalManagedNumbers}',
       case when coalesce(setup_json->'additionalManagedNumbers','[]'::jsonb) @> jsonb_build_array($2::text)
         then coalesce(setup_json->'additionalManagedNumbers','[]'::jsonb)
         else coalesce(setup_json->'additionalManagedNumbers','[]'::jsonb)||to_jsonb($2::text) end,true),updated_at=now()
       where tenant_id=$1`,
      [context.targetTenantId, context.phoneNumber]
    );
    await client.query(
      `insert into public.office_manager_profiles (tenant_id,brand_id,status,display_name,role_summary,default_tone,autonomy_mode,
       interruption_style,escalation_rules_json,industry_playbooks_json,guardrails_json,memory_rules_json,metadata_json)
       values ($1,$2,'ready',$3,$4,$5,'approval_required','natural',$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
       on conflict (tenant_id,brand_id) do update set status='ready',display_name=excluded.display_name,role_summary=excluded.role_summary,
       default_tone=excluded.default_tone,escalation_rules_json=excluded.escalation_rules_json,guardrails_json=excluded.guardrails_json,
       metadata_json=public.office_manager_profiles.metadata_json||excluded.metadata_json,updated_at=now()`,
      [context.targetTenantId, brandId, diamondProfile.displayName, diamondProfile.roleSummary, diamondProfile.tone,
       JSON.stringify(diamondProfile.escalationRules), JSON.stringify(["facility_maintenance", "contractor_recruiting", "vendor_relations", "job_coordination"]),
       JSON.stringify(diamondProfile.guardrails), JSON.stringify(["Retain only useful, reviewable business facts and confirmed caller details."]),
       JSON.stringify({ voiceGreeting: diamondProfile.greeting, voiceLanguages: diamondProfile.languages,
         voiceCallGoals: diamondProfile.callGoals, voiceCustomInstructions: diamondProfile.customInstructions, assistantId, phoneNumber: context.phoneNumber })]
    );
    await client.query(
      `insert into public.voice_provider_routes (tenant_id,brand_id,route_family,primary_provider_key,status,plain_language_status,live_actions_enabled,metadata_json)
       values ($1,$2,'voice_orchestrator',$3,'configured',$4,false,$5::jsonb)
       on conflict (tenant_id,brand_id,route_family) do update set primary_provider_key=excluded.primary_provider_key,status='configured',
       plain_language_status=excluded.plain_language_status,live_actions_enabled=false,
       metadata_json=public.voice_provider_routes.metadata_json||excluded.metadata_json,updated_at=now()`,
      [context.targetTenantId, brandId, PROVIDER_KEY,
       "Diamond Homes inbound line is configured for controlled intake. Outbound remains disabled pending callback and consent certification.",
       JSON.stringify({ assistantId, phoneNumber: context.phoneNumber, intentProfile: "diamond_homes_vendor_network_v1" })]
    );
    await client.query(
      `update public.provider_accounts set metadata_json=jsonb_set(jsonb_set(metadata_json,'{brandAssistants,diamond-homes}',to_jsonb($2::text),true),
       '{managedNumbers,diamond-homes}',to_jsonb($3::text),true),updated_at=now() where tenant_id=$1 and provider_key=$4`,
      [context.targetTenantId, assistantId, context.phoneNumber, PROVIDER_KEY]
    );
    await client.query("commit");
    return targetNumber.rows[0]!.id;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function rollbackStagedTransfer(client: pg.Client, context: TransferContext, targetNumberId: string) {
  await client.query("begin");
  try {
    await client.query(`delete from public.telephony_numbers where id=$1 and tenant_id=$2 and status='provisioning'`, [targetNumberId, context.targetTenantId]);
    await client.query(
      `update public.telephony_numbers set provider_resource_id=$2,status=$3,inbound_enabled=$4,outbound_enabled=$5,released_at=null,
       metadata_json=metadata_json||$6::jsonb,updated_at=now() where id=$1 and tenant_id=$7`,
      [context.sourceNumberId, context.providerResourceId, context.sourceNumberStatus, context.sourceInboundEnabled, context.sourceOutboundEnabled,
       JSON.stringify({ transferRollbackAt: new Date().toISOString() }), context.sourceTenantId]
    );
    if (context.sourcePhoneConnectionStatus) {
      await client.query(`update public.phone_connections set status=$2,ferocity_number=$3,updated_at=now() where tenant_id=$1`,
        [context.sourceTenantId, context.sourcePhoneConnectionStatus, context.sourcePhoneConnectionNumber]);
    }
    await client.query(
      `update public.phone_connections set setup_json=jsonb_set(setup_json,'{additionalManagedNumbers}',
       coalesce(setup_json->'additionalManagedNumbers','[]'::jsonb)-$2,true),updated_at=now() where tenant_id=$1`,
      [context.targetTenantId, context.phoneNumber]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function activateTransfer(client: pg.Client, context: TransferContext, targetNumberId: string, assistantId: string) {
  await client.query("begin");
  try {
    await client.query(
      `update public.telephony_numbers set status='active',inbound_enabled=true,outbound_enabled=false,callback_status='untested',
       activated_at=coalesce(activated_at,now()),metadata_json=metadata_json||$3::jsonb,updated_at=now() where id=$1 and tenant_id=$2`,
      [targetNumberId, context.targetTenantId, JSON.stringify({ assistantId, providerVerifiedAt: new Date().toISOString() })]
    );
    await client.query(
      `update public.voice_provider_routes set status='active',live_actions_enabled=true,
       plain_language_status='Diamond Homes inbound calls are active. Outbound remains disabled pending callback and consent certification.',updated_at=now()
       where tenant_id=$1 and brand_id=(select brand_id from public.telephony_numbers where id=$2) and route_family='voice_orchestrator'`,
      [context.targetTenantId, targetNumberId]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const routingReleaseConfirmed = process.argv.includes("--routing-release-confirmed");
  const targetTenantId = argument("target-tenant-id") ?? "11111111-1111-4111-8111-111111111111";
  const sourceTenantName = argument("source-tenant") ?? "Boden Anderson Workspace";
  const numberLast4 = argument("number-last4") ?? "4498";
  const transferNumber = optionalE164(argument("transfer"));
  if (!/^\d{4}$/.test(numberLast4)) throw new Error("--number-last4 must contain exactly four digits.");
  if (execute && !routingReleaseConfirmed) {
    throw new Error("Refusing live transfer until the number-specific inbound routing release is published and --routing-release-confirmed is supplied.");
  }
  const client = new Client({ connectionString: requiredEnvironment("DATABASE_URL") });
  await client.connect();
  try {
    const context = await loadContext(client, { targetTenantId, sourceTenantName, numberLast4 });
    const configuration = await resolveRetellConfiguration(targetTenantId, false);
    if (!configuration?.apiKey) throw new Error("The target tenant's Retell configuration is unavailable.");
    const remoteNumber = await readRetellNumber(configuration.apiKey, context.phoneNumber);
    const preflight = {
      action: execute ? "execute" : "preflight", sourceWorkspace: context.sourceTenantName,
      targetWorkspace: context.targetTenantName, targetBrand: "Diamond Homes", phoneNumber: suffix(context.phoneNumber),
      sourceStatus: context.sourceNumberStatus, existingTargetRetellNumbers: context.existingTargetNumbers,
      preservedHistoricalCalls: context.historicalCalls, remoteNumberFound: String(remoteNumber.phone_number ?? "") === context.phoneNumber,
      remoteInboundAssistants: assistantIds(remoteNumber, "inbound_agents").length,
      remoteOutboundAssistants: assistantIds(remoteNumber, "outbound_agents").length,
      existingDiamondBrand: Boolean(context.brandId), transferDestinationProvided: Boolean(transferNumber), outboundWillRemainDisabled: true
    };
    if (!execute) {
      console.log(JSON.stringify({ ok: true, ...preflight }, null, 2));
      return;
    }
    const brandId = await ensureDiamondBrand(client, targetTenantId);
    const existingProfile = await client.query<{ assistant_id: string | null }>(
      `select nullif(metadata_json->>'assistantId','') assistant_id from public.office_manager_profiles where tenant_id=$1 and brand_id=$2 limit 1`,
      [targetTenantId, brandId]
    );
    const assistantId = await prepareAssistant({ tenantId: targetTenantId, brandId,
      existingAssistantId: existingProfile.rows[0]?.assistant_id ?? null, transferNumber });
    const targetNumberId = await stageDatabaseTransfer(client, context, brandId, assistantId);
    const sourceAssistantId = assistantIds(remoteNumber, "inbound_agents")[0] ?? null;
    if (!sourceAssistantId) throw new Error("The source number has no verified inbound assistant to restore if cutover fails.");
    let activated = false;
    try {
      const result = await configureRetellManagedNumber(
        { tenantId: targetTenantId, brandId, correlationId: `diamond-homes-line-transfer:${brandId}`,
          idempotencyKey: `diamond-homes-line-transfer:${brandId}`, liveActionsEnabled: true, purpose: "authorized_test" },
        context.phoneNumber,
        { inboundAssistantId: assistantId, outboundAssistantId: assistantId,
          inboundWebhookUrl: `${APP_URL}/api/integrations/voice-ai/inbound`, nickname: "Diamond Homes Operations" },
        "restricted"
      );
      if (!result.ok) throw new Error(result.safeMessage);
      const verified = await readRetellNumber(configuration.apiKey, context.phoneNumber);
      const configured = assistantIds(verified, "inbound_agents").includes(assistantId)
        && assistantIds(verified, "outbound_agents").length === 0
        && verified.inbound_webhook_url === `${APP_URL}/api/integrations/voice-ai/inbound`;
      if (!configured) throw new Error("Retell verification did not match the intended restricted Diamond Homes binding.");
      await activateTransfer(client, context, targetNumberId, assistantId);
      activated = true;
    } catch (error) {
      const inspected = await readRetellNumber(configuration.apiKey, context.phoneNumber).catch(() => null);
      if (!inspected) {
        throw new Error("Cutover state is uncertain because Retell could not be re-read. The database remains staged with inbound disabled for operator recovery.", { cause: error });
      }
      const targetIsBound = assistantIds(inspected, "inbound_agents").includes(assistantId)
        && assistantIds(inspected, "outbound_agents").length === 0
        && inspected.inbound_webhook_url === `${APP_URL}/api/integrations/voice-ai/inbound`;
      if (targetIsBound) {
        try {
          await activateTransfer(client, context, targetNumberId, assistantId);
          activated = true;
        } catch (activationError) {
          const restored = await configureRetellManagedNumber(
            { tenantId: targetTenantId, brandId, correlationId: `diamond-homes-line-restore:${brandId}`,
              idempotencyKey: `diamond-homes-line-restore:${brandId}`, liveActionsEnabled: true, purpose: "authorized_test" },
            context.phoneNumber,
            { inboundAssistantId: sourceAssistantId, outboundAssistantId: sourceAssistantId,
              inboundWebhookUrl: `${APP_URL}/api/integrations/voice-ai/inbound`, nickname: context.sourceTenantName },
            "restricted"
          );
          const restoredRemote = restored.ok
            ? await readRetellNumber(configuration.apiKey, context.phoneNumber).catch(() => null)
            : null;
          const sourceIsRestored = Boolean(restoredRemote && assistantIds(restoredRemote, "inbound_agents").includes(sourceAssistantId));
          if (!sourceIsRestored) {
            throw new Error("Database activation failed and provider rollback could not be verified. The staged number remains fail-closed for operator recovery.", { cause: activationError });
          }
          await rollbackStagedTransfer(client, context, targetNumberId);
          throw activationError;
        }
      } else {
        await rollbackStagedTransfer(client, context, targetNumberId);
        throw error;
      }
    }
    if (!activated) throw new Error("The transfer did not reach an active, verified state.");
    console.log(JSON.stringify({ ok: true, action: "transferred", sourceWorkspace: context.sourceTenantName,
      targetWorkspace: context.targetTenantName, targetBrand: "Diamond Homes", phoneNumber: suffix(context.phoneNumber),
      preservedHistoricalCalls: context.historicalCalls, inboundActive: true, outboundEnabled: false,
      callbackCertificationRequired: true, humanTransferConfigured: Boolean(transferNumber) }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown transfer failure.");
  process.exitCode = 1;
});
