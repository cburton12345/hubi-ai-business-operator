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

const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const transferNumber = process.env.RETELL_TRANSFER_NUMBER?.trim() ?? "";
const clearDestination = process.env.RETELL_CLEAR_TRANSFER_DESTINATION === "true";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!clearDestination && !/^\+[1-9]\d{7,14}$/.test(transferNumber)) {
  throw new Error("RETELL_TRANSFER_NUMBER must be an E.164 phone number.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (clearDestination) {
    const cleared = await client.query(
      `update public.phone_connections
          set human_transfer_number=null,
              setup_json=setup_json || jsonb_build_object('transferClearedAt',now()),
              updated_at=now()
        where tenant_id=$1
        returning id`,
      [tenantId]
    );
    if (!cleared.rows[0]) throw new Error("The workspace does not have a phone connection to update.");
    console.log(JSON.stringify({ ok: true, tenantId, transferDestinationConfigured: false }, null, 2));
    process.exit(0);
  }
  const result = await client.query(
    `insert into public.phone_connections (
       tenant_id,brand_id,connection_path,ferocity_number,phone_provider_key,
       voice_agent_provider_key,human_transfer_number,status,capabilities_json,setup_json
     )
     select n.tenant_id,n.brand_id,'new_ferocity_number',n.phone_number,n.provider_key,
       'retell_voice',$2,'active',
       '["inbound_call","outbound_call","call_transfer","voicemail","recording","business_hours","multi_user"]'::jsonb,
       jsonb_build_object('backfilledFrom','telephony_numbers','telephonyNumberId',n.id,'transferConfiguredAt',now())
     from public.telephony_numbers n
     where n.tenant_id=$1 and n.provider_key='retell_voice'
     order by n.updated_at desc limit 1
     on conflict (tenant_id) do update set
       human_transfer_number=excluded.human_transfer_number,
       voice_agent_provider_key='retell_voice',
       setup_json=public.phone_connections.setup_json || excluded.setup_json,
       updated_at=now()
     returning id`,
    [tenantId, transferNumber]
  );
  if (!result.rows[0]) throw new Error("The workspace does not have a Retell number to configure.");
  console.log(JSON.stringify({ ok: true, tenantId, transferDestinationConfigured: true }, null, 2));
} finally {
  await client.end();
}
