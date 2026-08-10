create table if not exists public.owner_conversation_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'disabled'
    check (status in ('disabled','pending_verification','active','paused')),
  voice_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default false,
  push_enabled boolean not null default true,
  destination_ciphertext text,
  destination_fingerprint text,
  destination_verified_at timestamptz,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'America/Los_Angeles',
  preferred_windows_json jsonb not null default '[]'::jsonb,
  briefing_types_json jsonb not null default
    '["morning","urgent_decision","sales_opportunity","cash_flow","schedule_risk","automation_failure"]'::jsonb,
  preferred_channel_by_urgency_json jsonb not null default
    '{"routine":"push","important":"sms","urgent":"voice"}'::jsonb,
  maximum_proactive_calls_per_day integer not null default 2
    check (maximum_proactive_calls_per_day between 0 and 20),
  voicemail_allowed boolean not null default false,
  retry_allowed boolean not null default true,
  text_summary_after_call boolean not null default true,
  conversation_style text not null default 'concise'
    check (conversation_style in ('concise','conversational')),
  high_impact_requires_secondary_confirmation boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.owner_conversation_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  conversation_session_id uuid references public.office_manager_conversation_sessions(id) on delete set null,
  channel_key text not null check (channel_key in ('phone','sms','email','owner_command','app_push')),
  provider_key text,
  provider_session_id text,
  authentication_method text not null
    check (authentication_method in ('authenticated_app','verified_outbound_destination','one_time_code','human_verified')),
  trust_level text not null default 'standard'
    check (trust_level in ('standard','strong')),
  status text not null default 'verified'
    check (status in ('pending','verified','expired','revoked')),
  verified_at timestamptz,
  expires_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owner_conversation_auth_provider_session_idx
  on public.owner_conversation_auth_sessions (tenant_id, provider_key, provider_session_id)
  where provider_session_id is not null;

create index if not exists owner_conversation_auth_active_idx
  on public.owner_conversation_auth_sessions (tenant_id, user_id, status, expires_at desc);

create table if not exists public.conversational_action_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  conversation_session_id uuid references public.office_manager_conversation_sessions(id) on delete set null,
  auth_session_id uuid references public.owner_conversation_auth_sessions(id) on delete set null,
  office_manager_action_request_id uuid references public.office_manager_action_requests(id) on delete set null,
  action_type text not null,
  original_instruction text not null,
  interpreted_action_json jsonb not null default '{}'::jsonb,
  target_type text,
  target_id uuid,
  risk_level text not null default 'medium'
    check (risk_level in ('low','medium','high','prohibited')),
  approval_source text,
  explicit_approval boolean not null default false,
  secondary_confirmation boolean not null default false,
  status text not null default 'received'
    check (status in ('received','clarification_required','prepared','needs_approval','approved','queued','completed','blocked','failed','canceled')),
  idempotency_key text not null,
  provider_key text,
  before_state_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  reversible boolean not null default false,
  executed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists conversational_action_events_attention_idx
  on public.conversational_action_events (tenant_id, status, risk_level, created_at desc);

alter table public.owner_conversation_preferences enable row level security;
alter table public.owner_conversation_auth_sessions enable row level security;
alter table public.conversational_action_events enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'owner_conversation_preferences',
    'owner_conversation_auth_sessions',
    'conversational_action_events'
  ]
  loop
    execute format('drop policy if exists %I_tenant_operator on public.%I', table_name, table_name);
    execute format(
      'create policy %I_tenant_operator on public.%I for all using
       (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))
       with check
       (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name, table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json
)
select t.id, 'owner_conversational_operations', 'enabled', null, null,
  '{
    "category":"AI Office Manager",
    "description":"Private owner briefings and authenticated conversational decisions routed through existing Ferocity actions.",
    "publicFacing":false,
    "costed":true,
    "providerIndependent":true,
    "optInRequired":true
  }'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();
