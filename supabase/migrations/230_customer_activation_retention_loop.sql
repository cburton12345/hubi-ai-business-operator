create table if not exists public.customer_success_lifecycle_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  snapshot_date date not null default current_date,
  lifecycle_stage text not null check (lifecycle_stage in ('onboarding','activated','retained','at_risk','churned')),
  activation_score integer not null default 0 check (activation_score between 0 and 100),
  health_score integer not null default 0 check (health_score between 0 and 100),
  days_since_signup integer not null default 0 check (days_since_signup >= 0),
  days_since_activity integer not null default 0 check (days_since_activity >= 0),
  first_value_reached boolean not null default false,
  value_signals_json jsonb not null default '{}'::jsonb,
  risk_reasons_json jsonb not null default '[]'::jsonb,
  next_best_action text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, snapshot_date)
);

create index if not exists customer_success_lifecycle_stage_idx
  on public.customer_success_lifecycle_snapshots(lifecycle_stage,snapshot_date desc);

alter table public.customer_success_lifecycle_snapshots enable row level security;

drop policy if exists customer_success_lifecycle_snapshots_tenant_operator
  on public.customer_success_lifecycle_snapshots;
create policy customer_success_lifecycle_snapshots_tenant_operator
  on public.customer_success_lifecycle_snapshots
  for all
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

insert into public.workspace_feature_entitlements (
  tenant_id,feature_key,status,usage_limit,usage_period,metadata_json
)
select id,'customer_activation_retention_loop','enabled',null,'monthly',
  '{"category":"Customer Success","description":"Measures activation, first value, retention and churn risk, then gives Ferocity the next useful recovery action.","approvalMode":"enabled","plainRule":"Ferocity may measure and guide. Promotional outreach still requires consent and an authorized channel.","costed":false,"publicFacing":false}'::jsonb
from public.tenants
where status <> 'archived'
on conflict (tenant_id,feature_key) do update
set metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at=now();
