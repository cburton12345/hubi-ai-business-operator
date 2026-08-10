update public.ai_agent_runs
set status = 'failed',
    summary = coalesce(summary, 'Agent run expired before completion.'),
    error_message = coalesce(error_message, 'stale_run_timeout'),
    completed_at = now(),
    metadata_json = metadata_json || jsonb_build_object('expiredBy', 'migration_166', 'expiredAt', now())
where status in ('queued', 'running')
  and started_at < now() - interval '30 minutes';

create unique index if not exists idx_ai_agent_runs_one_active_per_workflow
  on public.ai_agent_runs(workflow_id)
  where workflow_id is not null and status in ('queued', 'running');
