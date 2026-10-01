import { queryPostgres, withPostgresTransaction } from "../src/lib/db/postgres";
import { encryptSecret } from "../src/lib/credentials/credential-vault";
import { getIndustryKnowledgeContext } from "../src/lib/industry-knowledge/get-industry-context";
import { reconcileManagedNumberLifecycleForTenant } from "../src/lib/phone/managed-number-lifecycle";
import { savePhoneConnection } from "../src/lib/phone/phone-connections";
import { buildVoiceAgentSystemPrompt, voiceProfileFromStored } from "../src/lib/phone/voice-agent-profile";
import { getVoiceAgentProvider } from "../src/lib/providers/voice-adapters";
import { getVoiceMaxDurationSeconds } from "../src/lib/usage/managed-voice";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function maskPhone(value: string | null | undefined) {
  return value ? `***${value.slice(-4)}` : null;
}

async function main() {
  const slug = argument("tenant");
  const transferNumber = argument("transfer");
  const execute = process.argv.includes("--execute");
  if (!slug || !transferNumber || !/^\+[1-9]\d{7,14}$/.test(transferNumber)) {
    throw new Error("Use --tenant <qa-or-smoke-slug> --transfer <E.164 number> [--execute].");
  }
  if (!/(qa|smoke|certif)/i.test(slug)) {
    throw new Error("This command is intentionally restricted to QA, smoke, or certification tenants.");
  }

  const tenantResult = await queryPostgres<{
    id: string;
    name: string;
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
    `select t.id,t.name,p.brand_id,p.display_name,p.role_summary,p.default_tone,
            p.escalation_rules_json,p.guardrails_json,p.metadata_json,
            nullif(a.metadata_json->>'assistantId','') assistant_id,
            nullif(a.metadata_json->>'outboundAssistantId','') outbound_assistant_id
       from public.tenants t
       join public.office_manager_profiles p on p.tenant_id=t.id
       left join public.provider_accounts a on a.tenant_id=t.id and a.provider_key='retell_voice'
      where t.slug=$1 and p.status in ('ready','active','needs_attention')
      order by p.updated_at desc limit 1`,
    [slug]
  );
  const tenant = tenantResult?.rows[0];
  if (!tenant) throw new Error("The certification tenant or its Office Manager profile was not found.");

  const existingNumber = await queryPostgres<{ phone_number: string; status: string }>(
    `select phone_number,status from public.telephony_numbers
      where tenant_id=$1 and provider_key='retell_voice' and status<>'released'
      order by created_at desc limit 1`,
    [tenant.id]
  );
  if (execute && process.argv.includes("--store-api-key")) {
    const apiKey = process.env.RETELL_API_KEY;
    const encrypted = apiKey ? encryptSecret(apiKey) : null;
    if (!encrypted) throw new Error("RETELL_API_KEY and a valid CREDENTIAL_ENCRYPTION_KEY are required to store the QA credential.");
    await queryPostgres(
      `insert into public.tenant_provider_credentials (
         tenant_id,provider_key,credential_label,credential_kind,status,secret_preview,secret_fingerprint,
         encrypted_secret,encryption_iv,encryption_tag,metadata_json
       ) values ($1,'retell_voice','retell_api_key','api_key','configured',$2,$3,$4,$5,$6,$7::jsonb)
       on conflict (tenant_id,provider_key,credential_label) do update set status='configured',
         secret_preview=excluded.secret_preview,secret_fingerprint=excluded.secret_fingerprint,
         encrypted_secret=excluded.encrypted_secret,encryption_iv=excluded.encryption_iv,
         encryption_tag=excluded.encryption_tag,metadata_json=public.tenant_provider_credentials.metadata_json||excluded.metadata_json,
         updated_at=now()`,
      [tenant.id,encrypted.secretPreview,encrypted.secretFingerprint,encrypted.encryptedSecret,
        encrypted.encryptionIv,encrypted.encryptionTag,JSON.stringify({ purpose: "managed_number_certification" })]
    );
  }
  if (existingNumber?.rows[0]) {
    console.log(JSON.stringify({
      ok: true,
      action: "already_provisioned",
      tenant: slug,
      number: maskPhone(existingNumber.rows[0].phone_number),
      status: existingNumber.rows[0].status
    }, null, 2));
    return;
  }

  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      action: "preflight",
      tenant: slug,
      transferNumber: maskPhone(transferNumber),
      wouldCreateDedicatedAgents: !tenant.assistant_id || !tenant.outbound_assistant_id,
      wouldProvisionAtMostOneNumber: true,
      customerOutboundInitiallyEnabled: false
    }, null, 2));
    return;
  }

  await withPostgresTransaction(async (client) => {
    await client.query(
      `insert into public.billing_subscriptions
         (tenant_id,plan_key,status,seats,current_period_start,current_period_end,metadata_json)
       values ($1,'starter','manual',1,now(),now()+interval '30 days',$2::jsonb)
       on conflict (tenant_id) do update set plan_key='starter',status='manual',
         current_period_start=now(),current_period_end=now()+interval '30 days',
         metadata_json=public.billing_subscriptions.metadata_json||excluded.metadata_json,updated_at=now()`,
      [tenant.id, JSON.stringify({ purpose: "managed_number_certification", syntheticBilling: true })]
    );
    await client.query(
      `update public.provider_accounts set status='connected',credentials_status='configured',
         ownership_mode='ferocity_managed',live_actions_enabled=true,
         metadata_json=metadata_json||$2::jsonb,updated_at=now()
       where tenant_id=$1 and provider_key='retell_voice'`,
      [tenant.id, JSON.stringify({ purpose: "managed_number_certification" })]
    );
  });

  await savePhoneConnection({
    tenantId: tenant.id,
    connectionPath: "new_ferocity_number",
    intendedUse: "Managed-number production lifecycle certification",
    humanTransferNumber: transferNumber,
    smsRequested: false,
    mmsRequested: false,
    phoneProviderKey: "retell_voice",
    phoneProviderLabel: "Ferocity-managed Retell",
    managedNumberProvisioningApproved: true
  });

  const [industryContext, maxDurationSeconds] = await Promise.all([
    getIndustryKnowledgeContext({
      tenantId: tenant.id,
      brandId: tenant.brand_id,
      categories: ["intake", "qualification", "scheduling", "safety", "follow_up"]
    }),
    getVoiceMaxDurationSeconds(tenant.id, "retell_voice")
  ]);
  const businessProfile = voiceProfileFromStored({
    displayName: tenant.display_name,
    roleSummary: tenant.role_summary,
    tone: tenant.default_tone,
    escalationRules: tenant.escalation_rules_json,
    guardrails: tenant.guardrails_json,
    metadata: tenant.metadata_json
  });
  const appUrl = (process.env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const sharedConfig = {
    model: { provider: "openai", model: "gpt-4.1-mini", messages: [{ role: "system", content: buildVoiceAgentSystemPrompt(businessProfile, industryContext) }] },
    server: { url: `${appUrl}/api/integrations/voice-ai/webhook` },
    serverMessages: ["status-update", "end-of-call-report", "transcript"],
    maxDurationSeconds,
    transferNumber,
    metadata: { profileSource: "ferocity_office_manager", purpose: "managed_number_certification" }
  };
  const adapter = getVoiceAgentProvider("retell_voice");
  if (!adapter || adapter.adapterStatus !== "live") throw new Error("The Retell adapter is not live.");
  const context = {
    tenantId: tenant.id,
    brandId: tenant.brand_id,
    correlationId: `managed-number-certification:${tenant.id}`,
    idempotencyKey: `managed-number-certification:${tenant.id}`,
    liveActionsEnabled: false,
    purpose: "authorized_test" as const
  };
  const inbound = await adapter.createOrUpdateAssistant(context, {
    assistantId: tenant.assistant_id,
    name: businessProfile.displayName,
    firstMessage: businessProfile.greeting,
    ...sharedConfig
  });
  if (!inbound.ok) throw new Error(inbound.safeMessage);
  const outbound = await adapter.createOrUpdateAssistant(
    { ...context, correlationId: `${context.correlationId}:outbound`, idempotencyKey: `${context.idempotencyKey}:outbound` },
    {
      assistantId: tenant.outbound_assistant_id,
      name: `${businessProfile.displayName} Outbound`,
      firstMessage: "Hello, this is the business calling through Ferocity. Is now an okay time to talk?",
      ...sharedConfig
    }
  );
  if (!outbound.ok) throw new Error(outbound.safeMessage);

  await withPostgresTransaction(async (client) => {
    await client.query(
      `update public.provider_accounts set status='connected',credentials_status='configured',
         ownership_mode='ferocity_managed',live_actions_enabled=true,
         metadata_json=metadata_json||$2::jsonb,updated_at=now()
       where tenant_id=$1 and provider_key='retell_voice'`,
      [tenant.id, JSON.stringify({
        assistantId: inbound.data.assistantId,
        outboundAssistantId: outbound.data.assistantId,
        assistantStatus: "configured",
        assistantSyncedAt: new Date().toISOString(),
        transferNumber,
        purpose: "managed_number_certification"
      })]
    );
    await client.query(
      `update public.office_manager_channel_configs set provider_key='retell_voice',status='ready',
         inbound_enabled=true,outbound_enabled=false,live_actions_enabled=false,
         setup_notes='Dedicated agents synchronized; outbound remains gated pending callback certification.',
         metadata_json=metadata_json||$2::jsonb,updated_at=now()
       where tenant_id=$1 and channel_key='phone'`,
      [tenant.id, JSON.stringify({
        assistantId: inbound.data.assistantId,
        outboundAssistantId: outbound.data.assistantId,
        syncedAt: new Date().toISOString(),
        purpose: "managed_number_certification"
      })]
    );
  });

  const lifecycle = await reconcileManagedNumberLifecycleForTenant(tenant.id);
  console.log(JSON.stringify({
    ok: lifecycle.status !== "blocked",
    tenant: slug,
    action: lifecycle.action,
    status: lifecycle.status,
    reason: lifecycle.reason,
    number: maskPhone(lifecycle.phoneNumber),
    customerOutboundInitiallyEnabled: false
  }, null, 2));
  if (lifecycle.status === "blocked") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
