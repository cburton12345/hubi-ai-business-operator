create table if not exists public.scoped_saved_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  preference_domain text not null,
  preference_key text not null,
  scope_type text not null
    check (scope_type in (
      'organization',
      'department',
      'location',
      'workflow',
      'user',
      'contact',
      'customer',
      'job',
      'project'
    )),
  scope_key text not null default 'default',
  value_json jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  source text not null default 'explicit'
    check (source in ('explicit', 'approved_learning', 'migration', 'system')),
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, preference_domain, preference_key, scope_type, scope_key)
);

create index if not exists scoped_saved_preferences_resolution_idx
  on public.scoped_saved_preferences (
    tenant_id,
    preference_domain,
    preference_key,
    scope_type,
    scope_key
  )
  where status = 'active';

create table if not exists public.preference_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  preference_domain text not null,
  preference_key text not null,
  event_type text not null
    check (event_type in (
      'resolved',
      'created',
      'changed',
      'one_time_override',
      'promoted_to_default',
      'blocked_by_policy'
    )),
  scope_type text,
  scope_key text,
  resolved_source text,
  previous_value_json jsonb,
  value_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id) on delete set null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists preference_audit_events_tenant_idx
  on public.preference_audit_events (
    tenant_id,
    preference_domain,
    preference_key,
    created_at desc
  );

create table if not exists public.communication_failover_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_id uuid references public.outbound_action_queue(id) on delete set null,
  original_provider_key text,
  original_method text,
  failure_reason text not null,
  fallback_offered_json jsonb not null default '[]'::jsonb,
  fallback_selected text,
  fallback_mode text not null default 'ask'
    check (fallback_mode in ('ask', 'automatic', 'none')),
  final_outcome text not null default 'pending'
    check (final_outcome in ('pending', 'selected', 'completed', 'failed', 'canceled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_failover_events_tenant_idx
  on public.communication_failover_events (
    tenant_id,
    final_outcome,
    created_at desc
  );

alter table public.scoped_saved_preferences enable row level security;
alter table public.preference_audit_events enable row level security;
alter table public.communication_failover_events enable row level security;

drop policy if exists scoped_saved_preferences_tenant_operator
  on public.scoped_saved_preferences;
create policy scoped_saved_preferences_tenant_operator
on public.scoped_saved_preferences
for all
using (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
);

drop policy if exists preference_audit_events_tenant_operator
  on public.preference_audit_events;
create policy preference_audit_events_tenant_operator
on public.preference_audit_events
for all
using (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
);

drop policy if exists communication_failover_events_tenant_operator
  on public.communication_failover_events;
create policy communication_failover_events_tenant_operator
on public.communication_failover_events
for all
using (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['owner', 'admin', 'operator']
  )
);

insert into public.scoped_saved_preferences (
  tenant_id,
  preference_domain,
  preference_key,
  scope_type,
  scope_key,
  value_json,
  source,
  metadata_json
)
select
  t.id,
  'communication',
  'delivery_method',
  'organization',
  'default',
  '{"method":"native_sms"}'::jsonb,
  'system',
  '{
    "principle":"configure_once_remember_override_instantly",
    "voiceMessagingEmailIndependent":true,
    "legalAndConsentAlwaysWin":true
  }'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (
  tenant_id,
  preference_domain,
  preference_key,
  scope_type,
  scope_key
) do nothing;

insert into public.workspace_feature_entitlements (
  tenant_id,
  feature_key,
  status,
  usage_limit,
  usage_period,
  metadata_json
)
select
  t.id,
  'scoped_saved_preferences',
  'enabled',
  null,
  null,
  '{
    "category":"Platform",
    "description":"Remember organization, department, location, workflow, user, contact, customer, job, and project defaults while allowing immediate one-time overrides.",
    "publicFacing":false,
    "costed":false
  }'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    metadata_json = public.workspace_feature_entitlements.metadata_json
      || excluded.metadata_json,
    updated_at = now();
