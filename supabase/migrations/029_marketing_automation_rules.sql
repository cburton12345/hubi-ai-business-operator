create table if not exists public.marketing_automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  automation_type text not null
    check (automation_type in (
      'recurring_seo_post',
      'gbp_post',
      'facebook_post',
      'review_request_campaign',
      'follow_up_sequence',
      'nurture_message',
      'reporting_summary'
    )),
  cadence text not null default 'weekly'
    check (cadence in ('weekly', 'biweekly', 'monthly', 'on_lead_created')),
  status text not null default 'active'
    check (status in ('active', 'paused')),
  settings_json jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, automation_type)
);

create table if not exists public.marketing_automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  rule_id uuid references public.marketing_automation_rules(id) on delete set null,
  automation_type text not null,
  status text not null default 'generated'
    check (status in ('generated', 'skipped', 'failed')),
  summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_automation_rules_tenant
  on public.marketing_automation_rules(tenant_id, status, next_run_at);

create index if not exists idx_marketing_automation_runs_tenant
  on public.marketing_automation_runs(tenant_id, created_at desc);

alter table public.marketing_automation_rules enable row level security;
alter table public.marketing_automation_runs enable row level security;

drop policy if exists marketing_automation_rules_tenant_operator on public.marketing_automation_rules;
create policy marketing_automation_rules_tenant_operator
on public.marketing_automation_rules
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists marketing_automation_runs_tenant_operator on public.marketing_automation_runs;
create policy marketing_automation_runs_tenant_operator
on public.marketing_automation_runs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
