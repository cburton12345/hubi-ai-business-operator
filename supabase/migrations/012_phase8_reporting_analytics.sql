create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_key text,
  source text,
  event_type text not null,
  event_value numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_attribution_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  source text not null,
  campaign_key text not null,
  match_rules_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_tenant_occurred
  on public.analytics_events(tenant_id, occurred_at desc);

create index if not exists idx_campaign_attribution_rules_tenant
  on public.campaign_attribution_rules(tenant_id, active);

alter table public.analytics_events enable row level security;
alter table public.campaign_attribution_rules enable row level security;

drop policy if exists analytics_events_tenant_operator on public.analytics_events;
create policy analytics_events_tenant_operator
on public.analytics_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists campaign_attribution_rules_tenant_admin on public.campaign_attribution_rules;
create policy campaign_attribution_rules_tenant_admin
on public.campaign_attribution_rules
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
