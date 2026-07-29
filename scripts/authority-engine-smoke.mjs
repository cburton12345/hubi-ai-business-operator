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
assert(process.env.DATABASE_URL, "DATABASE_URL is required for authority engine smoke.");

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const id = Date.now().toString(36);
const token = `proof-smoke-${id}-${crypto.randomBytes(4).toString("hex")}`;

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
  assert(tenant.rows[0]?.id, "No active or trial tenant exists for authority smoke.");
  const tenantId = tenant.rows[0].id;
  const brandId = tenant.rows[0].brand_id ?? null;
  assert(brandId, "No active brand exists for authority smoke.");
  line("Workspace", `${tenant.rows[0].name} (${tenantId})`);

  const customer = await client.query(
    `
    insert into public.customers (tenant_id, brand_id, name, email, phone, city, state, notes)
    values ($1, $2, $3, $4, '555-0188', 'Eau Claire', 'WI', 'Rollback-safe authority smoke test.')
    returning id
    `,
    [tenantId, brandId, `Authority Smoke ${id}`, `authority-smoke-${id}@example.com`]
  );
  const customerId = customer.rows[0].id;

  const job = await client.query(
    `
    insert into public.service_jobs (
      tenant_id, brand_id, customer_id, title, status, service_area, completion_notes, dispatcher_notes
    )
    values (
      $1, $2, $3, 'Completed roof repair authority smoke', 'completed', 'Eau Claire',
      'Smoke test completed job with approved factual notes only.',
      'Use this job to prepare proof, review, case study, FAQ, post, website, and video-script records.'
    )
    returning id
    `,
    [tenantId, brandId, customerId]
  );
  const jobId = job.rows[0].id;

  const bundle = await client.query(
    `
    insert into public.authority_content_bundles (
      tenant_id, brand_id, job_id, customer_id, status, bundle_type, title, summary, metadata_json
    )
    values ($1, $2, $3, $4, 'needs_review', 'completed_job', 'Authority smoke bundle', 'Smoke bundle from a completed job.', $5::jsonb)
    returning id
    `,
    [tenantId, brandId, jobId, customerId, JSON.stringify({ source: "authority_engine_smoke" })]
  );
  const bundleId = bundle.rows[0].id;

  await client.query(
    `
    insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, status, risk_level, metadata_json)
    values
      ($1, $2, 'case_study', 'Authority smoke case study', 'Draft from verified completed work only.', 'needs_review', 'medium', $3::jsonb),
      ($1, $2, 'video_script', 'Authority smoke video script', 'Short script using approved proof only.', 'needs_review', 'low', $3::jsonb)
    `,
    [tenantId, brandId, JSON.stringify({ source: "authority_engine_smoke", bundleId, jobId, truthfulUseOnly: true })]
  );

  await client.query(
    `
    insert into public.ugc_capture_requests (
      tenant_id, brand_id, customer_id, job_id, public_token, request_type, status, metadata_json
    )
    values ($1, $2, $3, $4, $5, 'before_after', 'ready', $6::jsonb)
    `,
    [tenantId, brandId, customerId, jobId, token, JSON.stringify({ source: "authority_engine_smoke", bundleId })]
  );

  await client.query(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, customer_id, job_id, trigger_event, channel, status, scheduled_for, ai_response_draft, metadata_json
    )
    values ($1, $2, $3, $4, 'job_completed', 'manual', 'draft', now() + interval '1 day', 'Review request smoke draft.', $5::jsonb)
    `,
    [tenantId, brandId, customerId, jobId, JSON.stringify({ source: "authority_engine_smoke", bundleId })]
  );

  await client.query(
    `
    insert into public.publishing_queue (tenant_id, brand_id, draft_id, target_platform, provider_status, queue_status, metadata_json)
    select tenant_id, brand_id, id, 'website', 'not_connected', 'needs_approval', $3::jsonb
    from public.ai_drafts
    where tenant_id = $1 and brand_id = $2 and metadata_json->>'bundleId' = $4
    limit 1
    `,
    [tenantId, brandId, JSON.stringify({ source: "authority_engine_smoke", bundleId, livePublishingGated: true }), bundleId]
  );

  await client.query(
    `
    insert into public.authority_events (
      tenant_id, brand_id, job_id, customer_id, event_type, status, priority, title, summary, recommended_action, source_table, source_id, metadata_json
    )
    values ($1, $2, $3, $4, 'job_completed', 'needs_review', 'high', 'Authority smoke bundle ready', 'Smoke authority bundle prepared.', 'Review before public use.', 'service_jobs', $3, $5::jsonb)
    `,
    [tenantId, brandId, jobId, customerId, JSON.stringify({ source: "authority_engine_smoke", bundleId })]
  );

  await client.query(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body, primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, 'content', 'authority_bundle_prepared', 'Authority smoke timeline event', 'Smoke authority bundle appeared in the automation timeline.', 'authority_content_bundle', $3, 'authority_content_bundles', $3, $4::jsonb)
    `,
    [tenantId, brandId, bundleId, JSON.stringify({ source: "authority_engine_smoke", requiresApproval: true })]
  );

  await client.query(
    `
    insert into public.authority_score_snapshots (
      tenant_id, brand_id, score, review_score, project_proof_score, content_score, website_score, consistency_score,
      explanations_json, missing_signals_json, metadata_json
    )
    values ($1, $2, 62, 20, 40, 35, 55, 60, '["Smoke snapshot"]'::jsonb, '[]'::jsonb, $3::jsonb)
    `,
    [tenantId, brandId, JSON.stringify({ source: "authority_engine_smoke" })]
  );

  const verification = await client.query(
    `
    select
      (select count(*)::int from public.authority_content_bundles where id = $1 and tenant_id = $2) as bundles,
      (select count(*)::int from public.ai_drafts where tenant_id = $2 and metadata_json->>'bundleId' = $1::text) as drafts,
      (select count(*)::int from public.ugc_capture_requests where tenant_id = $2 and metadata_json->>'bundleId' = $1::text) as proof_requests,
      (select count(*)::int from public.review_request_workflows where tenant_id = $2 and metadata_json->>'bundleId' = $1::text) as review_requests,
      (select count(*)::int from public.publishing_queue where tenant_id = $2 and metadata_json->>'bundleId' = $1::text) as publishing_items,
      (select count(*)::int from public.authority_events where tenant_id = $2 and metadata_json->>'bundleId' = $1::text) as authority_events,
      (select count(*)::int from public.operator_timeline_events where tenant_id = $2 and primary_entity_id = $1) as timeline_events,
      (select count(*)::int from public.authority_score_snapshots where tenant_id = $2 and metadata_json->>'source' = 'authority_engine_smoke') as score_snapshots
    `,
    [bundleId, tenantId]
  );
  const row = verification.rows[0];
  assert(row.bundles === 1, `expected 1 bundle, got ${row.bundles}`);
  assert(row.drafts === 2, `expected 2 drafts, got ${row.drafts}`);
  assert(row.proof_requests === 1, `expected 1 proof request, got ${row.proof_requests}`);
  assert(row.review_requests === 1, `expected 1 review request, got ${row.review_requests}`);
  assert(row.publishing_items === 1, `expected 1 publishing item, got ${row.publishing_items}`);
  assert(row.authority_events === 1, `expected 1 authority event, got ${row.authority_events}`);
  assert(row.timeline_events === 1, `expected 1 timeline event, got ${row.timeline_events}`);
  assert(row.score_snapshots === 1, `expected 1 score snapshot, got ${row.score_snapshots}`);

  line("Authority bundle", `${bundleId}; drafts=${row.drafts}; proof=${row.proof_requests}; review=${row.review_requests}`);
  line("Timeline", "authority bundle event is visible to the Automation Timeline data source");
  line("Cleanup", "transaction rolled back; no smoke records saved");
  console.log("Authority Engine smoke passed.");
} finally {
  await client.query("rollback");
  await client.end();
}
