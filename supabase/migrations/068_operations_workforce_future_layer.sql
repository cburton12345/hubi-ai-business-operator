create table if not exists public.operations_location_pings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete set null,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  pinged_at timestamptz not null default now(),
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric,
  location_label text,
  ping_source text not null default 'manual'
    check (ping_source in ('manual', 'gps', 'qr', 'vehicle_integration')),
  alert_status text not null default 'normal'
    check (alert_status in ('normal', 'late', 'off_route', 'missing_ping', 'needs_review')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.operations_field_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  media_type text not null default 'photo'
    check (media_type in ('photo', 'video', 'document', 'receipt', 'ai_walkthrough')),
  title text not null,
  file_url text,
  ai_summary text,
  customer_visible boolean not null default false,
  consent_status text not null default 'internal_only'
    check (consent_status in ('internal_only', 'permission_requested', 'approved_for_customer', 'approved_for_marketing')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_payroll_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'csv'
    check (provider in ('csv', 'quickbooks', 'gusto', 'adp', 'manual')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'exported', 'failed', 'cancelled')),
  total_hours numeric not null default 0,
  total_gross_cents integer not null default 0,
  export_payload_json jsonb not null default '{}'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_customer_update_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'sms'
    check (channel in ('sms', 'email', 'portal', 'phone_note')),
  subject text,
  body text not null,
  send_status text not null default 'draft'
    check (send_status in ('draft', 'approved', 'queued', 'sent', 'cancelled')),
  approval_required boolean not null default true,
  provider_message_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  provider_type text not null
    check (provider_type in ('payroll', 'accounting', 'calendar', 'gps', 'sms', 'email', 'storage')),
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'needs_attention', 'paused')),
  last_checked_at timestamptz,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create index if not exists idx_operations_location_pings_tenant_worker
  on public.operations_location_pings(tenant_id, worker_id, pinged_at desc);
create index if not exists idx_operations_field_media_tenant_status
  on public.operations_field_media(tenant_id, status, created_at desc);
create index if not exists idx_operations_payroll_exports_tenant_status
  on public.operations_payroll_exports(tenant_id, status, period_end desc);
create index if not exists idx_operations_customer_update_drafts_tenant_status
  on public.operations_customer_update_drafts(tenant_id, send_status, created_at desc);
create index if not exists idx_operations_provider_settings_tenant_type
  on public.operations_provider_settings(tenant_id, provider_type, status);

alter table public.operations_location_pings enable row level security;
alter table public.operations_field_media enable row level security;
alter table public.operations_payroll_exports enable row level security;
alter table public.operations_customer_update_drafts enable row level security;
alter table public.operations_provider_settings enable row level security;

drop policy if exists operations_location_pings_tenant on public.operations_location_pings;
create policy operations_location_pings_tenant on public.operations_location_pings for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_field_media_tenant on public.operations_field_media;
create policy operations_field_media_tenant on public.operations_field_media for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_payroll_exports_tenant on public.operations_payroll_exports;
create policy operations_payroll_exports_tenant on public.operations_payroll_exports for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_customer_update_drafts_tenant on public.operations_customer_update_drafts;
create policy operations_customer_update_drafts_tenant on public.operations_customer_update_drafts for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_provider_settings_tenant on public.operations_provider_settings;
create policy operations_provider_settings_tenant on public.operations_provider_settings for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
