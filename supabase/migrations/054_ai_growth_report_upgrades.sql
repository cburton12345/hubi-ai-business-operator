create table if not exists public.business_health_report_upgrades (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.website_grader_reports(id) on delete cascade,
  report_token text not null,
  email text not null,
  upgrade_status text not null default 'checkout_pending'
    check (upgrade_status in (
      'checkout_pending',
      'stripe_not_ready',
      'one_time_requested',
      'subscription_requested',
      'included_with_starter',
      'included_with_growth',
      'manual_follow_up',
      'unlocked',
      'cancelled'
    )),
  selected_path text not null default 'one_time'
    check (selected_path in ('one_time', 'starter', 'growth', 'operator', 'agency')),
  selected_plan text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  stripe_checkout_session_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_health_report_upgrades_report
  on public.business_health_report_upgrades(report_token, created_at desc);

create index if not exists idx_business_health_report_upgrades_email
  on public.business_health_report_upgrades(lower(email), created_at desc);

create index if not exists idx_business_health_report_upgrades_status
  on public.business_health_report_upgrades(upgrade_status, selected_path, created_at desc);

alter table public.business_health_report_upgrades enable row level security;

drop policy if exists business_health_report_upgrades_no_public_read on public.business_health_report_upgrades;
create policy business_health_report_upgrades_no_public_read
on public.business_health_report_upgrades
for select
using (false);

create or replace function public.set_business_health_report_upgrade_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_health_report_upgrades_touch_updated_at on public.business_health_report_upgrades;
create trigger business_health_report_upgrades_touch_updated_at
before update on public.business_health_report_upgrades
for each row
execute function public.set_business_health_report_upgrade_updated_at();
