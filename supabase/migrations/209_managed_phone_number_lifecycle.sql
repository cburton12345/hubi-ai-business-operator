-- Managed phone numbers are provisioned only after a workspace deliberately
-- selects Ferocity-managed calling. Provider work is queued and idempotent;
-- billing problems never cause an immediate, silent number loss.

alter table public.telephony_numbers
  add column if not exists activated_at timestamptz,
  add column if not exists billing_restricted_at timestamptz,
  add column if not exists retention_started_at timestamptz,
  add column if not exists retain_until timestamptz,
  add column if not exists port_out_requested_at timestamptz,
  add column if not exists release_requested_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists last_lifecycle_reconciled_at timestamptz,
  add column if not exists lifecycle_error text;

create table if not exists public.phone_number_lifecycle_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_connection_id uuid references public.phone_connections(id) on delete cascade,
  telephony_number_id uuid references public.telephony_numbers(id) on delete set null,
  provider_key text not null,
  action text not null
    check (action in ('provision','configure','restrict','restore','release','hold_for_port_out')),
  status text not null default 'queued'
    check (status in ('queued','processing','retrying','completed','blocked','failed','cancelled')),
  idempotency_key text not null unique,
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  provider_resource_id text,
  safe_error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_phone_number_lifecycle_jobs_due
  on public.phone_number_lifecycle_jobs(status, scheduled_for, created_at)
  where status in ('queued','retrying');

create index if not exists idx_telephony_numbers_retention
  on public.telephony_numbers(retain_until)
  where number_mode = 'ferocity_managed' and status in ('active','paused','needs_attention');

alter table public.phone_number_lifecycle_jobs enable row level security;

drop policy if exists phone_number_lifecycle_jobs_tenant_read on public.phone_number_lifecycle_jobs;
create policy phone_number_lifecycle_jobs_tenant_read
on public.phone_number_lifecycle_jobs
for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.phone_number_lifecycle_jobs is
  'Idempotent provider-independent work queue for managed phone-number provisioning, safe billing restriction, restoration, port-out holds, and release.';

comment on column public.telephony_numbers.retain_until is
  'Earliest time Ferocity may release a managed number after paid service ends. A port-out request always blocks automatic release.';
