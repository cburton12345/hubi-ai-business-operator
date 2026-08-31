-- Ferocity Connect: isolated Android/SIM SMS transport.

create table if not exists public.ferocity_connect_service_control (
  singleton boolean primary key default true check (singleton),
  sending_enabled boolean not null default true,
  pairing_enabled boolean not null default true,
  reason text,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.ferocity_connect_service_control (singleton) values (true) on conflict do nothing;

create table if not exists public.ferocity_connect_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text not null,
  status text not null default 'paired' check (status in ('paired','active','paused','needs_attention','revoked')),
  app_version text,
  android_version text,
  manufacturer text,
  model text,
  installation_fingerprint_hash text,
  default_sim_subscription_id integer,
  battery_percent integer check (battery_percent is null or battery_percent between 0 and 100),
  charging boolean,
  network_type text,
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  max_per_minute integer not null default 6 check (max_per_minute between 1 and 60),
  max_per_hour integer not null default 100 check (max_per_hour between 1 and 1000),
  max_per_day integer not null default 500 check (max_per_day between 1 and 10000),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists ferocity_connect_devices_tenant_idx on public.ferocity_connect_devices(tenant_id,status,last_heartbeat_at desc);

create table if not exists public.ferocity_connect_sims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid not null references public.ferocity_connect_devices(id) on delete cascade,
  subscription_id integer not null,
  slot_index integer,
  carrier_name text,
  phone_number_masked text,
  country_iso text,
  status text not null default 'available' check (status in ('available','default','paused','unavailable')),
  last_seen_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  unique(device_id,subscription_id)
);

create table if not exists public.ferocity_connect_pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token_hash text not null unique,
  issued_by_user_id uuid references public.users(id) on delete set null,
  display_name_hint text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_device_id uuid references public.ferocity_connect_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists ferocity_connect_pairing_active_idx on public.ferocity_connect_pairing_tokens(token_hash,expires_at) where consumed_at is null;

create table if not exists public.ferocity_connect_device_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid not null references public.ferocity_connect_devices(id) on delete cascade,
  token_prefix text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists ferocity_connect_credentials_device_idx on public.ferocity_connect_device_credentials(device_id,expires_at desc) where revoked_at is null;

create table if not exists public.ferocity_connect_request_nonces (
  credential_id uuid not null references public.ferocity_connect_device_credentials(id) on delete cascade,
  nonce_hash text not null,
  created_at timestamptz not null default now(),
  primary key (credential_id,nonce_hash)
);
create index if not exists ferocity_connect_nonces_expiry_idx on public.ferocity_connect_request_nonces(created_at);

create table if not exists public.ferocity_connect_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  requested_device_id uuid references public.ferocity_connect_devices(id) on delete set null,
  claimed_by_device_id uuid references public.ferocity_connect_devices(id) on delete set null,
  sim_subscription_id integer,
  recipient text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','claimed','sending','sent','delivered','failed_retryable','failed_terminal','dead_letter','canceled')),
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_message_ref text,
  last_error_code text,
  last_error_safe text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  unique(tenant_id,idempotency_key)
);
create index if not exists ferocity_connect_jobs_claim_idx on public.ferocity_connect_jobs(tenant_id,status,available_at,created_at) where status in ('queued','failed_retryable','claimed');
create index if not exists ferocity_connect_jobs_device_idx on public.ferocity_connect_jobs(claimed_by_device_id,status,updated_at desc);

create table if not exists public.ferocity_connect_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid not null references public.ferocity_connect_devices(id) on delete cascade,
  job_id uuid references public.ferocity_connect_jobs(id) on delete set null,
  event_type text not null check (event_type in ('paired','activated','heartbeat','claimed','sending','sent','delivered','failed','inbound','credential_rotated','paused','revoked')),
  device_event_id text,
  safe_detail text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(device_id,device_event_id)
);

create table if not exists public.ferocity_connect_abuse_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid references public.ferocity_connect_devices(id) on delete set null,
  category text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','reviewed','resolved','dismissed')),
  safe_summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.ferocity_connect_service_control enable row level security;
alter table public.ferocity_connect_devices enable row level security;
alter table public.ferocity_connect_sims enable row level security;
alter table public.ferocity_connect_pairing_tokens enable row level security;
alter table public.ferocity_connect_device_credentials enable row level security;
alter table public.ferocity_connect_request_nonces enable row level security;
alter table public.ferocity_connect_jobs enable row level security;
alter table public.ferocity_connect_events enable row level security;
alter table public.ferocity_connect_abuse_flags enable row level security;

create policy ferocity_connect_devices_tenant_admin on public.ferocity_connect_devices for all
  using (public.has_tenant_role(tenant_id,array['owner','admin'])) with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy ferocity_connect_sims_tenant_admin on public.ferocity_connect_sims for select
  using (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy ferocity_connect_events_tenant_admin on public.ferocity_connect_events for select
  using (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy ferocity_connect_jobs_tenant_admin on public.ferocity_connect_jobs for select
  using (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy ferocity_connect_abuse_tenant_admin on public.ferocity_connect_abuse_flags for select
  using (public.has_tenant_role(tenant_id,array['owner','admin']));

insert into public.messaging_providers (
  tenant_id,provider_key,display_name,provider_family,status,supports_sms,supports_mms,
  supports_inbound_webhook,supports_delivery_webhook,requires_registration,metadata_json
)
select id,'ferocity_connect','Ferocity Connect','sms','available',true,false,true,true,false,
  '{"purpose":"Use an explicitly paired Android device and SIM as an isolated SMS transport.","requiresPairedDevice":true}'::jsonb
from public.tenants where status <> 'archived'
on conflict (tenant_id,provider_key) do update set display_name=excluded.display_name,status=excluded.status,
  supports_sms=true,supports_inbound_webhook=true,supports_delivery_webhook=true,
  metadata_json=public.messaging_providers.metadata_json || excluded.metadata_json,updated_at=now();

insert into public.tenant_messaging_accounts (
  tenant_id,provider_key,ownership_mode,account_label,connection_status,credentials_status,
  live_sending_enabled,inbound_enabled,outbound_enabled,default_channel,metadata_json
)
select id,'ferocity_connect','customer_owned','Ferocity Connect Android gateway','not_connected','not_configured',
  false,false,false,'sms','{"requiresPairedDevice":true,"requiresExplicitEnable":true}'::jsonb
from public.tenants where status <> 'archived'
on conflict (tenant_id,provider_key,ownership_mode) do nothing;
