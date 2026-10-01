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

const phoneIndex = process.argv.indexOf("--phone");
const supplied = phoneIndex >= 0 ? process.argv[phoneIndex + 1] : "";
const digits = supplied.replace(/\D/g, "");
if (!/^1?\d{10}$/.test(digits)) throw new Error("A US phone number is required with --phone.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const national = digits.length === 11 ? digits.slice(1) : digits;
const e164 = `+1${national}`;
const recordOwnerAttestation = process.argv.includes("--record-owner-attestation");
const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (recordOwnerAttestation) {
    await client.query(
      `insert into public.contact_consent_records (
         tenant_id, channel, contact_value, status, source, recorded_at, metadata_json
       ) values ($1, 'phone', $2, 'granted', 'owner_attestation', now(), $3::jsonb)
       on conflict (tenant_id, channel, contact_value) do update
       set status='granted', source='owner_attestation', recorded_at=now(),
           metadata_json=public.contact_consent_records.metadata_json || excluded.metadata_json,
           updated_at=now()`,
      [tenantId, e164, JSON.stringify({ attestedBy: "workspace_owner", purpose: "one_time_ferocity_business_introduction" })]
    );
  }
  const result = await client.query(
    `select
       exists(
         select 1 from public.contact_consent_records
         where tenant_id=$1 and channel='phone' and status='granted'
           and right(regexp_replace(contact_value, '[^0-9]', '', 'g'), 10)=$2
       ) as consent_record,
       exists(
         select 1 from public.contact_suppression_list
         where tenant_id=$1 and channel='phone' and active=true
           and right(regexp_replace(contact_value, '[^0-9]', '', 'g'), 10)=$2
       ) as suppressed,
       exists(
         select 1 from public.leads
         where tenant_id=$1 and consent_to_contact=true
           and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10)=$2
       ) as lead_consent`,
    [tenantId, national]
  );
  const row = result.rows[0] ?? {};
  console.log(JSON.stringify({
    ok: row.suppressed !== true && (row.consent_record === true || row.lead_consent === true),
    consentRecorded: row.consent_record === true || row.lead_consent === true,
    suppressed: row.suppressed === true
  }, null, 2));
} finally {
  await client.end();
}
