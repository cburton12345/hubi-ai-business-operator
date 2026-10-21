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
        (select count(*)::int from public.integration_jobs where status in ('queued','running') and coalesce(started_at,scheduled_for,created_at) < now() - interval '30 minutes') as stuck_integration_jobs,
        (select count(*)::int from public.integration_jobs where status='failed' and coalesce(completed_at,created_at) >= now() - interval '24 hours') as failed_integration_jobs_24h,
        (select count(*)::int from public.document_intelligence_documents where status='processing' and updated_at < now() - interval '30 minutes') as stuck_documents,
        (select count(*)::int from public.document_intelligence_documents where status='failed' and updated_at >= now() - interval '24 hours') as failed_documents_24h,
        (select count(*)::int from public.integration_connections where status='error' or credentials_status in ('expired','invalid')) as unhealthy_connections,
        (select count(*)::int from public.capability_execution_audits where state in ('attempted','provider_accepted','delayed','unknown') and expected_event_at is not null and expected_event_at<now()) as overdue_expected_evidence,
        (select count(*)::int from public.capability_execution_audits where retry_count>=3 and state not in ('completed','confirmed','failed','blocked')) as retry_exhausted_executions,
        (select count(*)::int from public.app_error_events where severity in ('error','critical') and resolved_at is null and created_at>=now()-interval '24 hours') as unresolved_runtime_errors_24h,
        coalesce((select status from public.platform_capacity_snapshots order by created_at desc limit 1),'unknown') as latest_capacity_status,
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
  const blocking = Number(summary.active_missing_next_run)
    + Number(summary.stuck_agent_runs)
    + Number(summary.stuck_integration_jobs)
    + Number(summary.stuck_documents)
    + Number(summary.unhealthy_connections)
    + Number(summary.overdue_expected_evidence)
    + Number(summary.retry_exhausted_executions)
    + Number(summary.unresolved_runtime_errors_24h)
    + Number(summary.active_sequences_without_steps)
    + Number(summary.active_enrollments_without_sequence)
    + (["critical", "unknown"].includes(summary.latest_capacity_status) ? 1 : 0);
  console.log(JSON.stringify({
    status: blocking === 0 ? "healthy" : "needs_attention",
    workflowDefinitions: workflows.rows,
    health: summary
  }, null, 2));
  if (blocking > 0) process.exitCode = 2;
} finally {
  await client.end();
}
