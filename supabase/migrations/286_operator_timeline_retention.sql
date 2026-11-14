-- Bound high-volume operational telemetry without deleting customer, money,
-- job, communication, document, or owner-attention records. The product's
-- longest timeline aggregate window is 30 days, so the database refuses a
-- shorter retention interval.
create index if not exists operator_timeline_retention_idx
  on public.operator_timeline_events (occurred_at, id)
  where event_type in (
    'business_automation_loop',
    'action_queue_scan',
    'service_control_blocked',
    'ai_agent_workflow_run'
  );

create or replace function public.prune_operator_timeline_events(
  p_retain_days integer default 30,
  p_batch_size integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_rows integer := 0;
begin
  if p_retain_days < 30 or p_retain_days > 365 then
    raise exception 'p_retain_days must be between 30 and 365';
  end if;
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'p_batch_size must be between 1 and 50000';
  end if;

  -- Only one retention worker may select victims at a time. The xact-scoped
  -- lock releases automatically on success or failure.
  perform pg_advisory_xact_lock(hashtextextended('operator_timeline_retention', 0));

  with victims as (
    select event.id
    from public.operator_timeline_events event
    where event.event_type in (
      'business_automation_loop',
      'action_queue_scan',
      'service_control_blocked',
      'ai_agent_workflow_run'
    )
      and event.occurred_at < clock_timestamp() - make_interval(days => p_retain_days)
    order by event.occurred_at, event.id
    limit p_batch_size
    for update skip locked
  )
  delete from public.operator_timeline_events event
  using victims
  where event.id = victims.id;

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.prune_operator_timeline_events(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_operator_timeline_events(integer, integer)
  to service_role;

comment on function public.prune_operator_timeline_events(integer, integer) is
  'Deletes one bounded batch of four high-volume operational telemetry types older than the 30-day product window. Never targets business-domain or owner-attention events.';
