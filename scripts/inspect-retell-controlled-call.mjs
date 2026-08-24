import fs from "node:fs";
import pg from "pg";

for (const file of [new URL('../.env.local', import.meta.url), new URL('../.env', import.meta.url)]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const callIdIndex = process.argv.indexOf("--call-id");
const callId = callIdIndex >= 0 ? process.argv[callIdIndex + 1] : null;
const includeDetails = process.argv.includes("--details");

if (!/^call_[a-zA-Z0-9]+$/.test(callId ?? "")) {
  throw new Error("A valid Retell call ID is required with --call-id.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const result = await client.query(
    `select c.status, c.usage_units, c.summary, c.follow_up_status, c.updated_at, c.metadata_json,
            t.transcript_text
       from public.receptionist_calls c
       left join public.receptionist_call_transcripts t on t.tenant_id=c.tenant_id and t.call_id=c.id
      where c.provider_key = 'retell_voice' and c.provider_call_id = $1
      limit 1`,
    [callId]
  );
  const row = result.rows[0] ?? null;
  console.log(JSON.stringify({
    found: Boolean(row),
    status: row?.status ?? null,
    usageUnits: row?.usage_units ?? null,
    hasSummary: Boolean(row?.summary && !row.summary.startsWith("Founder-authorized")),
    followUpStatus: row?.follow_up_status ?? null,
    updatedAt: row?.updated_at ?? null,
    eventType: row?.metadata_json?.eventType ?? null,
    ...(includeDetails ? {
      summary: row?.summary ?? null,
      transcript: row?.transcript_text ?? null
    } : {})
  }, null, 2));
} finally {
  await client.end();
}
