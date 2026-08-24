-- Provider-independent operational trust layer. This extends existing queues,
-- provider lanes, feature gates, and audit feeds; it does not replace them.

-- Later queue processors support voice and explicitly manual fallbacks. Keep the
-- original queue and broaden its existing constraint instead of creating a new queue.
alter table public.outbound_action_queue drop constraint if exists outbound_action_queue_action_type_check;
alter table public.outbound_action_queue add constraint outbound_action_queue_action_type_check
  check (action_type in (
    'sms_send', 'email_send', 'voice_call', 'manual_message', 'phone_call',
    'publish_content', 'calendar_sync', 'review_request', 'billing_sync'
  ));

create table if not exists public.capability_trust_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability_key text not null,
  display_name text not null,
  intended_enabled boolean not null default true,
  trust_level text not null default 'unverified'
    check (trust_level in ('unverified', 'observing', 'assisted', 'trusted', 'autonomous')),
  recommended_trust_level text not null default 'unverified'
    check (recommended_trust_level in ('unverified', 'observing', 'assisted', 'trusted', 'autonomous')),
  health_state text not null default 'unknown'
    check (health_state in ('healthy', 'degraded', 'unavailable', 'configuration_required', 'verification_required', 'rate_limited', 'suspended', 'unknown')),
  enforcement_mode text not null default 'observe'
    check (enforcement_mode in ('observe', 'enforce')),
  emergency_paused boolean not null default false,
  verified_successes integer not null default 0 check (verified_successes >= 0),
  failures integer not null default 0 check (failures >= 0),
  meaningful_corrections integer not null default 0 check (meaningful_corrections >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_correction_at timestamptz,
  last_health_check_at timestamptz,
  last_regressed_at timestamptz,
  last_regression_reason text,
  promoted_by_user_id uuid references public.users(id) on delete set null,
  promoted_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, capability_key)
);

create table if not exists public.capability_dependencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability_key text not null,
  dependency_type text not null
    check (dependency_type in ('provider', 'integration', 'feature_gate', 'webhook', 'configuration', 'consent', 'queue', 'custom')),
  dependency_key text not null,
  required boolean not null default true,
  health_state text not null default 'unknown'
    check (health_state in ('healthy', 'degraded', 'unavailable', 'configuration_required', 'verification_required', 'rate_limited', 'suspended', 'unknown')),
  reason text,
  source_table text,
  source_id uuid,
  last_checked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, capability_key, dependency_type, dependency_key)
);

create table if not exists public.capability_execution_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability_key text not null,
  source_table text,
  source_id uuid,
  idempotency_key text not null,
  state text not null default 'planned'
    check (state in ('planned', 'queued', 'attempted', 'provider_accepted', 'delivered', 'confirmed', 'completed', 'failed', 'blocked', 'needs_attention', 'delayed', 'unknown')),
  provider_key text,
  fallback_provider_key text,
  authorization_basis text not null default 'none'
    check (authorization_basis in ('none', 'human_approval', 'automation_policy', 'system_observation')),
  initiator_type text not null default 'system'
    check (initiator_type in ('human', 'ai', 'automation', 'provider', 'system')),
  requested_by_user_id uuid references public.users(id) on delete set null,
  consequential boolean not null default false,
  confirmation_required boolean not null default false,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  fallback_count integer not null default 0 check (fallback_count >= 0),
  dependency_snapshot_json jsonb not null default '[]'::jsonb,
  provider_evidence_json jsonb not null default '{}'::jsonb,
  outcome_evidence_json jsonb not null default '{}'::jsonb,
  failure_category text,
  last_error text,
  expected_event_type text,
  expected_event_at timestamptz,
  queued_at timestamptz,
  attempted_at timestamptz,
  provider_accepted_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.capability_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability_key text not null,
  scope_type text not null default 'provider'
    check (scope_type in ('provider', 'integration', 'workflow', 'capability')),
  scope_key text not null,
  state text not null default 'closed'
    check (state in ('closed', 'open', 'half_open')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  failure_threshold integer not null default 3 check (failure_threshold between 1 and 100),
  opened_at timestamptz,
  next_probe_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, capability_key, scope_type, scope_key)
);

create index if not exists idx_capability_trust_health
  on public.capability_trust_profiles(tenant_id, intended_enabled, health_state, trust_level);
create index if not exists idx_capability_dependencies_health
  on public.capability_dependencies(tenant_id, capability_key, required, health_state);
create index if not exists idx_capability_execution_watchdog
  on public.capability_execution_audits(state, expected_event_at, tenant_id)
  where state in ('attempted', 'provider_accepted', 'delayed', 'unknown');
create index if not exists idx_capability_execution_source
  on public.capability_execution_audits(tenant_id, source_table, source_id, created_at desc);
create index if not exists idx_capability_circuits_open
  on public.capability_circuit_breakers(tenant_id, state, next_probe_at);

alter table public.capability_trust_profiles enable row level security;
alter table public.capability_dependencies enable row level security;
alter table public.capability_execution_audits enable row level security;
alter table public.capability_circuit_breakers enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'capability_trust_profiles',
    'capability_dependencies',
    'capability_execution_audits',
    'capability_circuit_breakers'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.capability_trust_profiles (
  tenant_id, capability_key, display_name, trust_level, recommended_trust_level,
  health_state, enforcement_mode, metadata_json
)
select t.id, defaults.capability_key, defaults.display_name, defaults.trust_level,
  defaults.trust_level, 'unknown', 'observe',
  jsonb_build_object('seededBy', 'capability_trust_v1', 'preservesExistingExecution', true)
from public.tenants t
cross join (
  values
    ('lead_capture', 'Lead capture', 'observing'),
    ('email_follow_up', 'Email follow-up', 'assisted'),
    ('sms_follow_up', 'SMS follow-up', 'assisted'),
    ('ai_calling', 'AI calling', 'assisted'),
    ('appointment_scheduling', 'Appointment scheduling', 'assisted'),
    ('estimate_follow_up', 'Estimate follow-up', 'assisted'),
    ('payment_collection', 'Payment collection', 'assisted'),
    ('review_requests', 'Review requests', 'assisted'),
    ('growth_distribution', 'Growth distribution', 'observing')
) as defaults(capability_key, display_name, trust_level)
where t.status <> 'archived'
on conflict (tenant_id, capability_key) do nothing;

-- Provider lanes are the source of truth for provider dependencies. A lane is
-- healthy only when it is connected/available and live actions are enabled;
-- assisted/manual capabilities remain visible without being falsely certified.
insert into public.capability_dependencies (
  tenant_id, capability_key, dependency_type, dependency_key, required,
  health_state, reason, source_table, source_id, last_checked_at, metadata_json
)
select lane.tenant_id,
  case lane.capability_key
    when 'email' then 'email_follow_up'
    when 'text_alerts' then 'sms_follow_up'
    when 'voice_ai' then 'ai_calling'
    when 'payments' then 'payment_collection'
    when 'meta_ads' then 'growth_distribution'
    when 'tiktok_ads' then 'growth_distribution'
    when 'google_ads' then 'growth_distribution'
    else lane.capability_key
  end,
  'provider', lane.provider_key, false,
  case
    when lane.connection_status = 'blocked' then 'suspended'
    when lane.credentials_status in ('expired', 'revoked') then 'verification_required'
    when lane.connection_status = 'needs_attention' then 'degraded'
    when lane.connection_status = 'paused' then 'unavailable'
    when lane.connection_status in ('connected', 'available') and lane.live_actions_enabled then 'healthy'
    when lane.credentials_status = 'not_configured' then 'configuration_required'
    else 'unknown'
  end,
  lane.plain_language_status, 'provider_connection_lanes', lane.id, now(),
  jsonb_build_object('laneKey', lane.lane_key, 'optionalUntilSelected', true)
from public.provider_connection_lanes lane
on conflict (tenant_id, capability_key, dependency_type, dependency_key) do update
set health_state = excluded.health_state,
    reason = excluded.reason,
    source_table = excluded.source_table,
    source_id = excluded.source_id,
    last_checked_at = now(),
    metadata_json = public.capability_dependencies.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, 'capability_trust_center', 'enabled', null, null,
  '{"category":"Trust and reliability","description":"Capability-level dependency health, progressive trust, truthful execution evidence, watchdogs, and circuit breakers.","approvalMode":"owner_controlled","publicFacing":false}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
