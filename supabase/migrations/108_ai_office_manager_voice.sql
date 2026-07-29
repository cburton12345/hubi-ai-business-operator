create table if not exists public.office_manager_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'active', 'paused', 'needs_attention', 'archived')),
  display_name text not null default 'Ferocity Office Manager',
  role_summary text not null default 'AI office manager for approved customer service, scheduling, follow-up, collections, and owner assistance.',
  default_tone text not null default 'warm, confident, direct, and natural',
  autonomy_mode text not null default 'approval_required'
    check (autonomy_mode in ('manual_only', 'draft_only', 'approval_required', 'auto_allowed')),
  interruption_style text not null default 'natural'
    check (interruption_style in ('conservative', 'natural', 'highly_responsive')),
  escalation_rules_json jsonb not null default '[]'::jsonb,
  industry_playbooks_json jsonb not null default '[]'::jsonb,
  guardrails_json jsonb not null default '[]'::jsonb,
  provider_preferences_json jsonb not null default '{}'::jsonb,
  memory_rules_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id)
);

create table if not exists public.office_manager_channel_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  profile_id uuid references public.office_manager_profiles(id) on delete cascade,
  channel_key text not null
    check (channel_key in ('phone', 'sms', 'email', 'website_chat', 'owner_command', 'app_push')),
  provider_key text,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'configured', 'ready', 'active', 'paused', 'needs_attention')),
  live_actions_enabled boolean not null default false,
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  recording_enabled boolean not null default false,
  transcript_enabled boolean not null default true,
  consent_required boolean not null default true,
  approval_mode text not null default 'approval_required'
    check (approval_mode in ('manual_only', 'draft_only', 'approval_required', 'auto_allowed')),
  fallback_route text not null default 'owner_queue',
  setup_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, channel_key)
);

create table if not exists public.office_manager_conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  profile_id uuid references public.office_manager_profiles(id) on delete set null,
  channel_key text not null
    check (channel_key in ('phone', 'sms', 'email', 'website_chat', 'owner_command', 'app_push')),
  provider_key text,
  external_session_id text,
  status text not null default 'open'
    check (status in ('open', 'waiting_on_customer', 'waiting_on_owner', 'ai_handled', 'human_handoff', 'closed', 'failed')),
  customer_sentiment text
    check (customer_sentiment in ('positive', 'neutral', 'confused', 'angry', 'urgent', 'unknown')),
  intent_key text,
  summary text,
  last_message_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_session_id)
);

create table if not exists public.office_manager_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  session_id uuid not null references public.office_manager_conversation_sessions(id) on delete cascade,
  speaker_type text not null
    check (speaker_type in ('customer', 'owner', 'employee', 'ai', 'system', 'provider')),
  channel_key text not null
    check (channel_key in ('phone', 'sms', 'email', 'website_chat', 'owner_command', 'app_push')),
  transcript text,
  redacted_transcript text,
  confidence_score integer check (confidence_score between 0 and 100),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  interruption_detected boolean not null default false,
  sentiment text
    check (sentiment in ('positive', 'neutral', 'confused', 'angry', 'urgent', 'unknown')),
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.office_manager_memory_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  source_session_id uuid references public.office_manager_conversation_sessions(id) on delete set null,
  fact_type text not null
    check (fact_type in ('customer_preference', 'warranty', 'pricing_rule', 'scheduling_rule', 'service_detail', 'employee_note', 'owner_rule', 'sop', 'risk_note', 'marketing_note')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'active', 'dismissed', 'archived')),
  title text not null,
  fact_text text not null,
  sensitivity text not null default 'internal'
    check (sensitivity in ('public', 'customer_context', 'internal', 'sensitive')),
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.office_manager_action_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  session_id uuid references public.office_manager_conversation_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  action_type text not null
    check (action_type in ('create_lead', 'create_customer', 'schedule_appointment', 'create_estimate', 'create_job', 'assign_worker', 'send_reminder', 'request_review', 'collect_payment', 'create_task', 'order_materials', 'handoff_owner', 'update_record', 'marketing_followup', 'custom')),
  status text not null default 'needs_review'
    check (status in ('draft', 'needs_review', 'approved', 'queued', 'completed', 'blocked', 'dismissed', 'failed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  confidence_score integer not null default 70 check (confidence_score between 0 and 100),
  title text not null,
  summary text,
  recommended_action text,
  target_table text,
  target_id uuid,
  idempotency_key text,
  requires_owner boolean not null default true,
  due_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.office_manager_performance_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  metric_date date not null default current_date,
  calls_answered integer not null default 0 check (calls_answered >= 0),
  conversations_handled integer not null default 0 check (conversations_handled >= 0),
  human_handoffs integer not null default 0 check (human_handoffs >= 0),
  appointments_booked integer not null default 0 check (appointments_booked >= 0),
  leads_created integer not null default 0 check (leads_created >= 0),
  revenue_influenced_cents integer not null default 0 check (revenue_influenced_cents >= 0),
  owner_minutes_saved integer not null default 0 check (owner_minutes_saved >= 0),
  average_latency_ms integer check (average_latency_ms is null or average_latency_ms >= 0),
  customer_satisfaction_score integer check (customer_satisfaction_score between 0 and 100),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, metric_date)
);

alter table public.office_manager_profiles enable row level security;
alter table public.office_manager_channel_configs enable row level security;
alter table public.office_manager_conversation_sessions enable row level security;
alter table public.office_manager_conversation_turns enable row level security;
alter table public.office_manager_memory_facts enable row level security;
alter table public.office_manager_action_requests enable row level security;
alter table public.office_manager_performance_metrics enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'office_manager_profiles',
    'office_manager_channel_configs',
    'office_manager_conversation_sessions',
    'office_manager_conversation_turns',
    'office_manager_memory_facts',
    'office_manager_action_requests',
    'office_manager_performance_metrics'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

create index if not exists office_manager_profiles_tenant_idx
  on public.office_manager_profiles(tenant_id, status, updated_at desc);
create index if not exists office_manager_channels_tenant_idx
  on public.office_manager_channel_configs(tenant_id, channel_key, status);
create index if not exists office_manager_sessions_tenant_idx
  on public.office_manager_conversation_sessions(tenant_id, status, last_message_at desc nulls last);
create index if not exists office_manager_turns_session_idx
  on public.office_manager_conversation_turns(tenant_id, session_id, occurred_at desc);
create index if not exists office_manager_memory_tenant_idx
  on public.office_manager_memory_facts(tenant_id, status, fact_type, updated_at desc);
create index if not exists office_manager_actions_tenant_idx
  on public.office_manager_action_requests(tenant_id, status, priority, created_at desc);
create index if not exists office_manager_metrics_tenant_idx
  on public.office_manager_performance_metrics(tenant_id, metric_date desc);

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'ai_office_manager',
  'enabled',
  500,
  'monthly',
  '{"category":"AI Workforce","description":"AI Office Manager for customer service, scheduling, follow-up, owner commands, and voice-ready workflows.","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Let AI handle routine office work through approved channels. Live calls and sends require provider setup and approval.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = coalesce(public.workspace_feature_entitlements.usage_period, excluded.usage_period),
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'ai_office_manager', 'AI Office Manager preview', true, 'Setup checklist and owner command routing', 148, '{"officeManager":true,"voiceLive":false}'::jsonb),
  ('starter', 'ai_office_manager', 'AI Office Manager', true, 'Lead follow-up, reminders, review drafts, and daily office queue', 148, '{"officeManager":true,"voiceLive":false}'::jsonb),
  ('growth', 'ai_office_manager', 'AI Office Manager Growth', true, 'Customer service plus proof, reviews, marketing follow-up, and website lead routing', 148, '{"officeManager":true,"voiceLive":false}'::jsonb),
  ('operator', 'ai_office_manager', 'AI Office Manager Pro', true, 'Office queue, scheduling, job coordination, collections, and voice readiness', 148, '{"officeManager":true,"voiceReady":true}'::jsonb),
  ('managed_operator', 'ai_office_manager', 'Managed AI Office Manager', true, 'Managed setup, monitoring, tuning, and escalation', 148, '{"officeManager":true,"managedService":true,"voiceReady":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

insert into public.provider_connection_lanes (
  tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
  credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
)
select
  t.id,
  defaults.capability_key,
  defaults.provider_key,
  defaults.lane_key,
  defaults.display_name,
  defaults.connection_status,
  defaults.credentials_status,
  false,
  defaults.source,
  defaults.plain_language_status,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('voice_ai', 'customer_voice_provider', 'customer_owned', 'Customer voice provider', 'not_connected', 'not_configured', 'manual', 'Connect the customer phone, voice AI, STT, and TTS providers when live call handling is ready.', '{"sort":25}'::jsonb),
    ('voice_ai', 'ferocity_voice_manager', 'ferocity_managed', 'Ferocity managed voice office manager', 'not_connected', 'not_configured', 'platform_default', 'Managed voice requires provider keys, phone routing, call recording rules, consent, approval gates, and budget limits.', '{"sort":25}'::jsonb)
) as defaults(
  capability_key, provider_key, lane_key, display_name, connection_status, credentials_status,
  source, plain_language_status, metadata_json
)
on conflict (tenant_id, capability_key, lane_key) do nothing;
