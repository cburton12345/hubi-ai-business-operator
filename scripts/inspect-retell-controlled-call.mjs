import pg from "pg";

const callIdIndex = process.argv.indexOf("--call-id");
const callId = callIdIndex >= 0 ? process.argv[callIdIndex + 1] : null;

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
    `select status, usage_units, summary, follow_up_status, updated_at, metadata_json
       from public.receptionist_calls
      where provider_key = 'retell_voice' and provider_call_id = $1
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
    eventType: row?.metadata_json?.eventType ?? null
  }, null, 2));
} finally {
  await client.end();
}
