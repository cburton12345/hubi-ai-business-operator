create table if not exists public.external_call_log_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null unique references public.integration_connections(id) on delete cascade,
  provider_key text not null,
  enabled boolean not null default false,
  status text not null default 'not_ready'
    check (status in ('not_ready','ready','paused','error')),
  delivery_mode text not null default 'native_api'
    check (delivery_mode in ('native_api','signed_webhook','manual_export')),
  include_summary boolean not null default true,
  include_transcript boolean not null default false,
  last_verified_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create table if not exists public.external_call_log_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  call_id uuid not null references public.receptionist_calls(id) on delete cascade,
  provider_key text not null,
  external_contact_id text,
  status text not null default 'queued'
    check (status in ('queued','delivering','retry','needs_mapping','blocked','delivered','dead_lettered','cancelled')),
  idempotency_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  external_record_id text,
  safe_error_message text,
  delivered_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, connection_id, call_id),
  unique (idempotency_key)
);

create index if not exists external_call_log_delivery_ready_idx
  on public.external_call_log_deliveries(tenant_id, status, next_attempt_at, created_at)
  where status in ('queued','retry');

create index if not exists external_call_log_delivery_call_idx
  on public.external_call_log_deliveries(tenant_id, call_id, created_at desc);

alter table public.external_call_log_settings enable row level security;
alter table public.external_call_log_deliveries enable row level security;

drop policy if exists external_call_log_settings_tenant on public.external_call_log_settings;
create policy external_call_log_settings_tenant on public.external_call_log_settings for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists external_call_log_deliveries_tenant on public.external_call_log_deliveries;
create policy external_call_log_deliveries_tenant on public.external_call_log_deliveries for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.external_call_log_settings is
  'Explicit per-tenant authorization for optional CRM/service-platform call handoff. Connecting a provider never enables write-back by itself.';

comment on table public.external_call_log_deliveries is
  'Provider-independent, idempotent post-call handoff outbox. Failures remain isolated from the canonical Ferocity call record.';

comment on column public.external_call_log_settings.include_transcript is
  'Off by default. Full transcripts remain in Ferocity unless a tenant deliberately enables a compliant provider transfer.';
