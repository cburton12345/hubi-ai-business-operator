import fs from "node:fs";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const expectedNumber = "+18882566005";
const apply = process.argv.includes("--apply");
const disable = process.argv.includes("--disable");
if (apply && disable) throw new Error("Choose either --apply or --disable.");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  await client.query("begin");
  const provider = (await client.query(
    `select status, credentials_status, live_actions_enabled, ownership_mode,
            nullif(metadata_json->>'assistantId', '') as assistant_id
       from public.provider_accounts
      where tenant_id = $1 and provider_key = 'retell_voice'
      for update`,
    [tenantId]
  )).rows[0];
  const number = (await client.query(
    `select phone_number, status, inbound_enabled, outbound_enabled, compliance_status
       from public.telephony_numbers
      where tenant_id = $1 and provider_key = 'retell_voice' and phone_number = $2
      for update`,
    [tenantId, expectedNumber]
  )).rows[0];

  if (!provider) throw new Error("The Ferocity Retell provider account is missing.");
  if (provider.credentials_status !== "configured") throw new Error("Retell credentials are not configured.");
  if (!provider.assistant_id) throw new Error("The Ferocity Retell assistant is missing.");
  if (provider.ownership_mode !== "ferocity_managed") throw new Error("The provider is not the Ferocity-managed Retell account.");
  if (!number || number.phone_number !== expectedNumber || number.status !== "active") {
    throw new Error("The expected active Ferocity support number is missing.");
  }

  if (disable) {
    const disabled = JSON.stringify({
      controlledOutboundTestDisabledAt: new Date().toISOString(),
      disabledReason: "provider_credential_rejected"
    });
    await client.query(
      `update public.provider_accounts
          set status = 'paused', live_actions_enabled = false,
              metadata_json = metadata_json || $2::jsonb, updated_at = now()
        where tenant_id = $1 and provider_key = 'retell_voice'`,
      [tenantId, disabled]
    );
    await client.query(
      `update public.voice_provider_routes
          set status = 'paused', live_actions_enabled = false,
              plain_language_status = 'Retell is paused until its production credential is replaced and verified.',
              updated_at = now()
        where tenant_id = $1 and route_family = 'voice_orchestrator'
          and primary_provider_key = 'retell_voice'`,
      [tenantId]
    );
    await client.query(
      `update public.telephony_numbers
          set outbound_enabled = false, inbound_enabled = false,
              metadata_json = metadata_json || $2::jsonb, updated_at = now()
        where tenant_id = $1 and provider_key = 'retell_voice' and phone_number = $3`,
      [tenantId, disabled, expectedNumber]
    );
    await client.query(
      `update public.live_action_policies
          set status = 'disabled', metadata_json = metadata_json || $2::jsonb, updated_at = now()
        where tenant_id = $1 and action_key = 'voice_call'`,
      [tenantId, disabled]
    );
    await client.query("commit");
  } else if (apply) {
    const activation = JSON.stringify({
      controlledOutboundTestEnabledAt: new Date().toISOString(),
      controlledOutboundTestOnly: true,
      activationSource: "founder_authorized_test"
    });
    await client.query(
      `update public.provider_accounts
          set status = 'connected', live_actions_enabled = true,
              metadata_json = metadata_json || $2::jsonb, updated_at = now()
        where tenant_id = $1 and provider_key = 'retell_voice'`,
      [tenantId, activation]
    );
    await client.query(
      `update public.voice_provider_routes
          set status = 'active', live_actions_enabled = true,
              plain_language_status = 'Retell is enabled for a controlled outbound certification call. Production inbound activation still requires completed call evidence and fallback review.',
              updated_at = now()
        where tenant_id = $1 and route_family = 'voice_orchestrator'
          and primary_provider_key = 'retell_voice'`,
      [tenantId]
    );
    await client.query(
      `update public.telephony_numbers
          set outbound_enabled = true, inbound_enabled = false,
              compliance_status = case when compliance_status = 'needs_review' then 'ready' else compliance_status end,
              metadata_json = metadata_json || $2::jsonb, updated_at = now()
        where tenant_id = $1 and provider_key = 'retell_voice' and phone_number = $3`,
      [tenantId, activation, expectedNumber]
    );
    await client.query(
      `insert into public.live_action_policies (
         tenant_id, action_key, provider_key, label, status, minimum_plan_key,
         requires_consent, requires_human_approval, risk_level, metadata_json
       ) values (
         $1, 'voice_call', 'retell_voice', 'AI voice calls', 'live', 'operator',
         true, true, 'high', $2::jsonb
       )
       on conflict (tenant_id, action_key) do update
       set provider_key = excluded.provider_key,
           label = excluded.label,
           status = excluded.status,
           requires_consent = true,
           requires_human_approval = true,
           risk_level = 'high',
           metadata_json = public.live_action_policies.metadata_json || excluded.metadata_json,
           updated_at = now()`,
      [tenantId, activation]
    );
    await client.query("commit");
  } else {
    await client.query("rollback");
  }

  console.log(JSON.stringify({
    ok: true,
    applied: apply,
    disabled: disable,
    tenantId,
    providerConfigured: true,
    assistantPresent: true,
    phonePresent: true,
    outboundTestEnabled: disable ? false : apply || (provider.live_actions_enabled && number.outbound_enabled),
    inboundProductionEnabled: false,
    nextStep: disable
      ? "Replace and verify the Retell production credential before enabling another controlled test."
      : apply
      ? "Place one authorized call, then verify webhook, transcript, summary, usage, cost, and fallback before enabling inbound production."
      : "Run with --apply to enable only the controlled outbound certification path."
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
