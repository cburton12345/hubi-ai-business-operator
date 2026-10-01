-- Verified severe-weather signals with separate internal-demand corroboration.
-- Weather alone is an opportunity signal; Ferocity may only describe demand as
-- rising when recent tenant lead activity independently supports that statement.

create table if not exists public.weather_demand_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  service_area_target_id uuid references public.service_area_targets(id) on delete set null,
  provider_key text not null default 'nws' check (provider_key in ('nws')),
  external_alert_id text not null,
  event_name text not null,
  headline text,
  severity text,
  certainty text,
  urgency text,
  area_description text,
  effective_at timestamptz,
  expires_at timestamptz,
  source_url text,
  signal_status text not null default 'weather_only'
    check (signal_status in ('weather_only', 'demand_corroborated', 'recommended', 'dismissed', 'expired')),
  service_relevance_score integer not null default 0 check (service_relevance_score between 0 and 100),
  demand_confidence_score integer not null default 0 check (demand_confidence_score between 0 and 100),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  demand_evidence_json jsonb not null default '{}'::jsonb,
  source_payload_json jsonb not null default '{}'::jsonb,
  push_notified_at timestamptz,
  push_notification_claim text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, service_area_target_id, provider_key, external_alert_id)
);

create index if not exists weather_demand_signals_active_idx
  on public.weather_demand_signals(tenant_id, brand_id, signal_status, opportunity_score desc, expires_at);

alter table public.weather_demand_signals enable row level security;

drop policy if exists weather_demand_signals_tenant_operator on public.weather_demand_signals;
create policy weather_demand_signals_tenant_operator
on public.weather_demand_signals
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

comment on table public.weather_demand_signals is
  'Provider-sourced severe-weather opportunities. Weather evidence and tenant-specific demand corroboration remain distinct to prevent unsupported demand claims.';

-- Weather recommendations are first-class in-app notifications and may be
-- dismissed/read independently by each signed-in workspace user.
alter table public.in_app_notification_states
  drop constraint if exists in_app_notification_states_source_type_check;
alter table public.in_app_notification_states
  add constraint in_app_notification_states_source_type_check
  check (source_type in ('owner_event','ai_work','approval','provider_request','funding_alert','marketing_recommendation'));
