import fs from "node:fs";
import pg from "pg";

const runtimeEnv = { ...(typeof process === 'undefined' ? {} : process.env) };
const runtimeArgv = typeof process === 'undefined' ? [] : process.argv;
for (const file of [new URL('../.env.local', import.meta.url), new URL('../.env', import.meta.url)]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || runtimeEnv[match[1]]) continue;
    runtimeEnv[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
if (typeof globalThis.__FEROCITY_RETELL_API_KEY === 'string') {
  runtimeEnv.RETELL_API_KEY = globalThis.__FEROCITY_RETELL_API_KEY;
}

const callIdIndex = runtimeArgv.indexOf("--call-id");
const callId = callIdIndex >= 0
  ? runtimeArgv[callIdIndex + 1]
  : typeof globalThis.__FEROCITY_RETELL_TEST_CALL_ID === 'string'
    ? globalThis.__FEROCITY_RETELL_TEST_CALL_ID
    : null;

if (!/^call_[a-zA-Z0-9]+$/.test(callId ?? "")) {
  throw new Error("A valid Retell call ID is required with --call-id.");
}
if (!runtimeEnv.DATABASE_URL || !runtimeEnv.RETELL_API_KEY) {
  throw new Error("DATABASE_URL and RETELL_API_KEY are required.");
}

const tenantId = runtimeEnv.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const response = await fetch(`https://api.retellai.com/v2/get-call/${encodeURIComponent(callId)}`, {
  headers: { Authorization: `Bearer ${runtimeEnv.RETELL_API_KEY}` }
});
const call = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Retell returned HTTP ${response.status}.`);

if (
  call?.metadata?.ferocityTenantId !== tenantId
  || call?.metadata?.ferocityAuthorizedTest !== true
  || call?.from_number !== "+18882566005"
) {
  throw new Error("Refusing to reconcile a call outside the founder-authorized certification scope.");
}
if (!["ended", "not_connected", "error"].includes(call.call_status)) {
  throw new Error(`Call is ${call.call_status}; only terminal calls can be reconciled.`);
}

const completed = call.call_status === "ended";
const missed = ["dial_no_answer", "dial_busy", "user_declined"].includes(call.disconnection_reason ?? "");
const terminalStatus = completed ? "completed" : missed ? "missed" : "failed";
const durationSeconds = Math.max(0, Math.round(Number(call.duration_ms ?? 0) / 1000));
const summary = typeof call?.call_analysis?.call_summary === "string"
  ? call.call_analysis.call_summary.slice(0, 500)
  : completed
    ? "Controlled Retell certification call completed."
    : `Controlled Retell certification call did not connect (${call.disconnection_reason ?? call.call_status}).`;
const transcript = typeof call.transcript === "string" ? call.transcript.slice(0, 500) : null;
const sentiment = String(call?.call_analysis?.user_sentiment ?? "unknown").toLowerCase();
const costCents = Math.max(0, Math.round(Number(call?.call_cost?.combined_cost ?? 0)));

const client = new pg.Client({
  connectionString: runtimeEnv.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const updated = await client.query(
    `update public.receptionist_calls
        set status = $8,
            duration_seconds = greatest(duration_seconds, $1),
            summary = $2,
            sentiment = case when $3 = 'positive' then 'positive' else sentiment end,
            usage_units = greatest(usage_units, $4),
            metadata_json = metadata_json || $5::jsonb,
            updated_at = now()
      where tenant_id = $6 and provider_key = 'retell_voice' and provider_call_id = $7
        and metadata_json->>'source' = 'founder_authorized_certification'
      returning id`,
    [
      durationSeconds,
      summary,
      sentiment,
      durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0,
      JSON.stringify({
        reconciledFromProvider: true,
        disconnectionReason: call.disconnection_reason ?? null,
        providerCostCents: costCents
      }),
      tenantId,
      callId,
      terminalStatus
    ]
  );
  const internalCallId = updated.rows[0]?.id;
  if (!internalCallId) throw new Error("Controlled call record was not found.");

  if (transcript) {
    await client.query(
      `insert into public.receptionist_call_transcripts (
         tenant_id, call_id, provider_key, status, transcript_text, redacted_transcript_text,
         consent_status, metadata_json
       ) values ($1,$2,'retell_voice','available',$3,$3,'granted',$4::jsonb)
       on conflict (tenant_id, call_id) do update
       set status = 'available', transcript_text = excluded.transcript_text,
           redacted_transcript_text = excluded.redacted_transcript_text, updated_at = now()`,
      [tenantId, internalCallId, transcript, JSON.stringify({ source: "provider_reconciliation", controlledTest: true })]
    );
  }

  console.log(JSON.stringify({
    ok: true,
    reconciled: true,
    status: terminalStatus,
    durationSeconds,
    hasTranscript: Boolean(transcript),
    hasSummary: Boolean(summary),
    sentiment,
    providerCostCents: costCents,
    disconnectionReason: call.disconnection_reason ?? null
  }, null, 2));
} finally {
  await client.end();
}
