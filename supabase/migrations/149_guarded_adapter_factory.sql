create table if not exists public.provider_adapter_builds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null unique references public.provider_integration_requests(id) on delete cascade,
  provider_key text not null,
  provider_name text not null,
  capability_category text not null,
  documentation_url text,
  documentation_origin text,
  status text not null default 'queued'
    check (status in (
      'queued', 'researching', 'needs_information', 'draft_ready',
      'approval_required', 'changes_requested', 'approved_for_engineering',
      'released', 'rejected', 'failed'
    )),
  risk_level text not null default 'high'
    check (risk_level in ('low', 'medium', 'high')),
  manifest_json jsonb not null default '{}'::jsonb,
  generated_artifact_json jsonb not null default '{}'::jsonb,
  automated_checks_json jsonb not null default '[]'::jsonb,
  last_error text,
  requested_at timestamptz not null default now(),
  research_started_at timestamptz,
  draft_completed_at timestamptz,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  release_version text,
  released_at timestamptz,
  notification_sent_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_adapter_build_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  build_id uuid not null references public.provider_adapter_builds(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system'
    check (actor_type in ('customer', 'ai', 'operator', 'system')),
  from_status text,
  to_status text,
  summary text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_adapter_builds_queue
  on public.provider_adapter_builds(status, updated_at, tenant_id);

create index if not exists idx_provider_adapter_build_events_build
  on public.provider_adapter_build_events(build_id, created_at desc);

alter table public.provider_adapter_builds enable row level security;
alter table public.provider_adapter_build_events enable row level security;

drop policy if exists provider_adapter_builds_tenant_read on public.provider_adapter_builds;
create policy provider_adapter_builds_tenant_read
on public.provider_adapter_builds
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists provider_adapter_builds_tenant_update on public.provider_adapter_builds;
create policy provider_adapter_builds_tenant_update
on public.provider_adapter_builds
for update
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists provider_adapter_build_events_tenant_read on public.provider_adapter_build_events;
create policy provider_adapter_build_events_tenant_read
on public.provider_adapter_build_events
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json
)
select
  t.id,
  'adapter_factory',
  case when coalesce(t.plan_key, 'free') in ('operator', 'managed_operator', 'pro_agency') then 'enabled' else 'limited' end,
  case when coalesce(t.plan_key, 'free') in ('operator', 'managed_operator', 'pro_agency') then 10 else 2 end,
  'monthly',
  '{"advanced":true,"productionReleaseRequiresReview":true,"arbitraryCodeExecution":false,"officialOpenApiPreferred":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
select
  p.plan_key,
  'adapter_factory',
  'Ask Ferocity to enable another provider',
  p.plan_key in ('starter', 'growth', 'operator', 'managed_operator', 'pro_agency'),
  case
    when p.plan_key in ('operator', 'managed_operator', 'pro_agency') then 'Priority adapter research and guarded build drafts'
    when p.plan_key in ('starter', 'growth') then 'Adapter requests and demand tracking'
    else 'Paid plan required'
  end,
  210,
  '{"advanced":true,"approvalRequired":true,"productionReleaseRequiresEngineering":true}'::jsonb
from public.billing_plans p
on conflict (plan_key, feature_key) do update
set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
  updated_at = now();
