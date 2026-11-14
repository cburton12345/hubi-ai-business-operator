-- Run retention inside Postgres so database protection does not depend on a
-- frontend deployment or consume Netlify scheduled-function credits.
do $migration$
declare
  existing_job_id bigint;
begin
  if not exists (
    select 1
    from pg_catalog.pg_available_extensions
    where name = 'pg_cron'
  ) then
    raise notice 'pg_cron is unavailable; the Netlify retention fallback remains available';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;

  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'ferocity-operator-timeline-retention'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'ferocity-operator-timeline-retention',
    '17 * * * *',
    $schedule$select public.prune_operator_timeline_events(30, 5000);$schedule$
  );
end;
$migration$;

