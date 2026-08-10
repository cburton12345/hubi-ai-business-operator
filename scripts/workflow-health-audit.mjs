import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const [workflows, health] = await Promise.all([
    client.query(`
      select agent_key, status, run_mode, cadence_key, count(*)::int as workspaces
      from public.ai_agent_workflows
      group by agent_key, status, run_mode, cadence_key
      order by agent_key, status
    `),
    client.query(`
      select
        (select count(*)::int from public.ai_agent_workflows where status='active') as active_agent_workflows,
        (select count(*)::int from public.ai_agent_workflows where status='active' and cadence_key <> 'manual' and next_run_at is null) as active_missing_next_run,
        (select count(*)::int from public.ai_agent_workflows where status='active' and last_run_status='failed') as active_last_run_failed,
        (select count(*)::int from public.ai_agent_runs where status in ('queued','running') and started_at < now() - interval '30 minutes') as stuck_agent_runs,
        (select count(*)::int from public.outbound_action_queue where status in ('approved','queued') and coalesce(scheduled_for, created_at) <= now()) as due_outbound_actions,
        (select count(*)::int from public.outbound_action_queue where status in ('failed','blocked') and updated_at >= now() - interval '24 hours') as failed_or_blocked_actions_24h,
        (select count(*)::int from public.follow_up_workflows where status in ('open','scheduled','missed') and coalesce(due_at, created_at) <= now()) as due_followups,
        (select count(*)::int from public.review_request_workflows where status in ('draft','scheduled') and coalesce(scheduled_for, created_at) <= now()) as due_review_requests,
        (select count(*)::int
           from public.revenue_followup_sequences s
          where s.status='active'
            and not exists (select 1 from public.revenue_followup_steps st where st.sequence_id=s.id)) as active_sequences_without_steps,
        (select count(*)::int
           from public.revenue_followup_enrollments e
          where e.status='active'
            and e.sequence_id is null) as active_enrollments_without_sequence
    `)
  ]);

  const summary = health.rows[0];
  const blocking = Number(summary.active_missing_next_run) + Number(summary.stuck_agent_runs) + Number(summary.active_sequences_without_steps) + Number(summary.active_enrollments_without_sequence);
  console.log(JSON.stringify({
    status: blocking === 0 ? "healthy" : "needs_attention",
    workflowDefinitions: workflows.rows,
    health: summary
  }, null, 2));
  if (blocking > 0) process.exitCode = 2;
} finally {
  await client.end();
}
