import crypto from "node:crypto";
import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  const [{ resolveRetellConfiguration }, { queryPostgres }] = await Promise.all([
    import("../src/lib/providers/retell-config"),
    import("../src/lib/db/postgres")
  ]);
  const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
  const appUrl = (process.env.EXTERNAL_TEST_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const configuration = await resolveRetellConfiguration(tenantId, true);
  if (!configuration?.phoneNumber) throw new Error("The live Retell phone configuration is unavailable.");
  const body = JSON.stringify({
    event: "call_inbound",
    call_inbound: { from_number: "+15555550100", to_number: configuration.phoneNumber }
  });
  const timestamp = Date.now().toString();
  const digest = crypto.createHmac("sha256", configuration.webhookApiKey).update(`${body}${timestamp}`).digest("hex");
  const response = await fetch(`${appUrl}/api/integrations/voice-ai/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": `v=${timestamp},d=${digest}` },
    body
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.call_inbound?.metadata?.ferocityAccepted !== true || !payload?.call_inbound?.override_agent_id) {
    throw new Error(`The signed inbound route did not accept the configured number (HTTP ${response.status}).`);
  }
  const badResponse = await fetch(`${appUrl}/api/integrations/voice-ai/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": `v=${timestamp},d=${"0".repeat(64)}` },
    body
  });
  if (badResponse.status !== 401) throw new Error("The inbound route did not reject an invalid Retell signature.");
  const number = await queryPostgres<{ inbound_enabled: boolean; outbound_enabled: boolean; compliance_status: string }>(
    `select inbound_enabled,outbound_enabled,compliance_status from public.telephony_numbers
      where tenant_id=$1 and provider_key='retell_voice' and phone_number=$2 limit 1`,
    [tenantId, configuration.phoneNumber]
  );
  console.log(JSON.stringify({
    ok: true,
    signedInboundAccepted: true,
    invalidSignatureRejected: true,
    assistantSelected: true,
    restrictedMode: payload.call_inbound.retell_llm_dynamic_variables?.ferocity_call_mode ?? null,
    number: number?.rows[0] ?? null
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
