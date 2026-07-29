import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function line(label, detail) {
  console.log(`${label.padEnd(30)} ${detail}`);
}

loadLocalEnv();
assert(process.env.DATABASE_URL, "DATABASE_URL is required for Office Manager smoke.");

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const id = Date.now().toString(36);
const externalSessionId = `office-smoke-${id}-${crypto.randomBytes(4).toString("hex")}`;

await client.connect();
await client.query("begin");

try {
  const tenant = await client.query(
    `
    select t.id, t.name, b.id as brand_id
    from public.tenants t
    left join public.brands b on b.tenant_id = t.id and b.status = 'active'
    where t.status in ('active', 'trial')
    order by t.created_at asc
    limit 1
    `
  );
  assert(tenant.rows[0]?.id, "No active or trial tenant exists for Office Manager smoke.");
  const tenantId = tenant.rows[0].id;
  const brandId = tenant.rows[0].brand_id ?? null;
  line("Workspace", `${tenant.rows[0].name} (${tenantId})`);

  const profile = await client.query(
    `
    insert into public.office_manager_profiles (
      tenant_id, brand_id, status, display_name, role_summary, autonomy_mode, interruption_style,
      escalation_rules_json, guardrails_json, metadata_json
    )
    values (
      $1, $2, 'ready', 'Smoke Office Manager',
      'Rollback-safe Office Manager smoke profile.',
      'approval_required', 'natural',
      '["urgent lead", "payment issue", "owner approval required"]'::jsonb,
      '["No customer promises without approval", "No live voice sends in smoke tests"]'::jsonb,
      $3::jsonb
    )
    returning id
    `,
    [tenantId, brandId, JSON.stringify({ source: "office_manager_smoke" })]
  );
  const profileId = profile.rows[0].id;

  await client.query(
    `
    insert into public.office_manager_channel_configs (
      tenant_id, brand_id, profile_id, channel_key, provider_key, status, live_actions_enabled,
      inbound_enabled, outbound_enabled, setup_notes, metadata_json
    )
    values
      ($1, $2, $3, 'owner_command', 'ferocity', 'active', false, true, false, 'Owner commands are available without a voice provider.', $4::jsonb),
      ($1, $2, $3, 'phone', 'voice_provider_placeholder', 'not_connected', false, false, false, 'Live voice stays disabled until provider keys and consent are verified.', $4::jsonb)
    `,
    [tenantId, brandId, profileId, JSON.stringify({ source: "office_manager_smoke" })]
  );

  const session = await client.query(
    `
    insert into public.office_manager_conversation_sessions (
      tenant_id, brand_id, profile_id, channel_key, provider_key, external_session_id, status,
      customer_sentiment, intent_key, summary, last_message_at, metadata_json
    )
    values (
      $1, $2, $3, 'owner_command', 'ferocity', $4, 'waiting_on_owner',
      'urgent', 'schedule_appointment',
      'Smoke session: customer needs appointment follow-up and owner approval.',
      now(), $5::jsonb
    )
    returning id
    `,
    [tenantId, brandId, profileId, externalSessionId, JSON.stringify({ source: "office_manager_smoke" })]
  );
  const sessionId = session.rows[0].id;

  await client.query(
    `
    insert into public.office_manager_conversation_turns (
      tenant_id, brand_id, session_id, speaker_type, channel_key, transcript, redacted_transcript,
      confidence_score, sentiment, metadata_json
    )
    values
      ($1, $2, $3, 'customer', 'owner_command', 'Need a call back about scheduling tomorrow.', 'Need a call back about scheduling tomorrow.', 88, 'urgent', $4::jsonb),
      ($1, $2, $3, 'ai', 'owner_command', 'Prepared callback task and owner handoff.', 'Prepared callback task and owner handoff.', 91, 'neutral', $4::jsonb)
    `,
    [tenantId, brandId, sessionId, JSON.stringify({ source: "office_manager_smoke" })]
  );

  await client.query(
    `
    insert into public.office_manager_memory_facts (
      tenant_id, brand_id, source_session_id, fact_type, status, title, fact_text, sensitivity, metadata_json
    )
    values (
      $1, $2, $3, 'owner_rule', 'needs_review',
      'Callback approval rule',
      'Escalate urgent callbacks to the owner before sending any customer-facing confirmation.',
      'internal', $4::jsonb
    )
    `,
    [tenantId, brandId, sessionId, JSON.stringify({ source: "office_manager_smoke" })]
  );

  await client.query(
    `
    insert into public.office_manager_action_requests (
      tenant_id, brand_id, session_id, action_type, status, priority, confidence_score,
      title, summary, recommended_action, idempotency_key, requires_owner, due_at, metadata_json
    )
    values (
      $1, $2, $3, 'schedule_appointment', 'needs_review', 'urgent', 89,
      'Approve callback for scheduling request',
      'Office Manager prepared a callback task from an owner-command session.',
      'Approve the callback task or edit the timing.',
      $4, true, now() + interval '1 day', $5::jsonb
    )
    `,
    [tenantId, brandId, sessionId, `office-smoke-action-${id}`, JSON.stringify({ source: "office_manager_smoke" })]
  );

  await client.query(
    `
    insert into public.office_manager_performance_metrics (
      tenant_id, brand_id, metric_date, calls_answered, conversations_handled, human_handoffs,
      appointments_booked, leads_created, owner_minutes_saved, customer_satisfaction_score, metadata_json
    )
    values ($1, $2, current_date, 0, 1, 1, 0, 0, 8, 92, $3::jsonb)
    `,
    [tenantId, brandId, JSON.stringify({ source: "office_manager_smoke" })]
  );

  await client.query(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body, primary_entity_type,
      primary_entity_id, source_table, source_id, metadata_json
    )
    values (
      $1, $2, 'ai', 'office_manager_action_prepared',
      'Office Manager smoke action prepared',
      'Rollback-safe Office Manager action appeared in the automation timeline.',
      'office_manager_session', $3, 'office_manager_conversation_sessions', $3, $4::jsonb
    )
    `,
    [tenantId, brandId, sessionId, JSON.stringify({ source: "office_manager_smoke", requiresApproval: true })]
  );

  const verification = await client.query(
    `
    select
      (select count(*)::int from public.office_manager_profiles where tenant_id = $1 and metadata_json->>'source' = 'office_manager_smoke') as profiles,
      (select count(*)::int from public.office_manager_channel_configs where tenant_id = $1 and metadata_json->>'source' = 'office_manager_smoke') as channels,
      (select count(*)::int from public.office_manager_conversation_sessions where tenant_id = $1 and external_session_id = $2) as sessions,
      (select count(*)::int from public.office_manager_conversation_turns where tenant_id = $1 and session_id = $3) as turns,
      (select count(*)::int from public.office_manager_memory_facts where tenant_id = $1 and source_session_id = $3) as facts,
      (select count(*)::int from public.office_manager_action_requests where tenant_id = $1 and session_id = $3) as actions,
      (select count(*)::int from public.office_manager_performance_metrics where tenant_id = $1 and metadata_json->>'source' = 'office_manager_smoke') as metrics,
      (select count(*)::int from public.operator_timeline_events where tenant_id = $1 and primary_entity_id = $3) as timeline_events
    `,
    [tenantId, externalSessionId, sessionId]
  );
  const row = verification.rows[0];
  assert(row.profiles === 1, `expected 1 profile, got ${row.profiles}`);
  assert(row.channels === 2, `expected 2 channels, got ${row.channels}`);
  assert(row.sessions === 1, `expected 1 session, got ${row.sessions}`);
  assert(row.turns === 2, `expected 2 turns, got ${row.turns}`);
  assert(row.facts === 1, `expected 1 memory fact, got ${row.facts}`);
  assert(row.actions === 1, `expected 1 action request, got ${row.actions}`);
  assert(row.metrics === 1, `expected 1 metric row, got ${row.metrics}`);
  assert(row.timeline_events === 1, `expected 1 timeline event, got ${row.timeline_events}`);

  line("Office Manager", `profile=${profileId}; session=${sessionId}; action=needs_review`);
  line("Timeline", "Office Manager action is visible to the Automation Timeline data source");
  line("Cleanup", "transaction rolled back; no smoke records saved");
  console.log("Office Manager smoke passed.");
} finally {
  await client.query("rollback");
  await client.end();
}
