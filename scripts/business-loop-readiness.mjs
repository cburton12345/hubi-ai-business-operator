import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

let tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (process.env.TENANT_SLUG) {
    const tenant = await client.query("select id from public.tenants where slug=$1 limit 1", [process.env.TENANT_SLUG]);
    if (!tenant.rows[0]?.id) throw new Error(`Tenant slug not found: ${process.env.TENANT_SLUG}`);
    tenantId = tenant.rows[0].id;
  }
  const stages = await client.query(
      `select current_stage, count(*)::int as runs from public.business_loop_runs
       where tenant_id=$1 group by current_stage order by current_stage`,
      [tenantId]
    );
  const policies = await client.query(
      `select action_key,status,requires_human_approval,requires_consent from public.live_action_policies
       where tenant_id=$1 order by action_key`,
      [tenantId]
    );
  const providers = await client.query(
      `select count(*)::int as configured from public.provider_accounts
       where tenant_id=$1 and status='connected' and credentials_status='configured'`,
      [tenantId]
    );
  const certification = await client.query(
      `select status,passed_stage_count,failed_stage_count,certified_at,expires_at
       from public.business_loop_certifications where tenant_id=$1 and certification_key='golden-business-loop-v1'`,
      [tenantId]
    );
  const runs = await client.query(
    `select r.id, r.mode, r.status, r.current_stage, r.completed_stage_count,
            r.handoff_gap_count, r.lead_id, r.estimate_id, r.job_id, r.invoice_id,
            count(s.id)::int as stage_run_count,
            coalesce(jsonb_agg(jsonb_build_object(
              'stage', s.stage_key,
              'status', s.status,
              'blockedBy', s.blocked_by_stage
            ) order by s.ordinal) filter (where s.id is not null), '[]'::jsonb) as stages
       from public.business_loop_runs r
       left join public.business_loop_stage_runs s
         on s.tenant_id=r.tenant_id and s.loop_run_id=r.id
      where r.tenant_id=$1
      group by r.id
      order by r.completed_stage_count desc, r.updated_at desc
      limit 10`,
    [tenantId]
  );
  console.log(JSON.stringify({
    tenantId,
    currentStages: stages.rows,
    liveActionPolicies: policies.rows,
    connectedConfiguredProviders: providers.rows[0]?.configured ?? 0,
    certification: certification.rows[0] ?? { status: "not_tested" },
    runs: runs.rows
  }, null, 2));
} finally {
  await client.end();
}
