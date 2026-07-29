create table if not exists public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  provider_key text not null,
  provider_event_id text not null,
  event_type text not null,
  resource_type text,
  resource_id text,
  signature_status text not null default 'unverified'
    check (signature_status in ('unverified', 'verified', 'failed', 'not_required')),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed', 'retrying')),
  idempotency_key text not null,
  error_category text,
  safe_error_message text,
  payload_redacted_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider_key, provider_event_id),
  unique (idempotency_key)
);

create table if not exists public.telephony_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider_key text not null,
  number_mode text not null default 'ferocity_managed'
    check (number_mode in ('ferocity_managed', 'forward_existing', 'customer_owned', 'byo_twilio', 'sip_trunk')),
  phone_number text not null,
  display_name text,
  provider_resource_id text,
  status text not null default 'planned'
    check (status in ('planned', 'provisioning', 'active', 'forwarding_pending', 'paused', 'released', 'failed', 'needs_attention')),
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  recording_default_enabled boolean not null default false,
  transcript_default_enabled boolean not null default true,
  compliance_status text not null default 'needs_review'
    check (compliance_status in ('needs_review', 'ready', 'blocked', 'not_required')),
  routing_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_number),
  unique (provider_key, provider_resource_id)
);

create table if not exists public.receptionist_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  telephony_number_id uuid references public.telephony_numbers(id) on delete set null,
  office_manager_session_id uuid references public.office_manager_conversation_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  provider_key text not null,
  provider_call_id text not null,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  caller_number text,
  called_number text,
  status text not null default 'received'
    check (status in ('received', 'ringing', 'in_progress', 'completed', 'missed', 'transferred', 'failed', 'spam', 'blocked')),
  outcome text
    check (outcome in ('new_lead', 'existing_customer', 'scheduled', 'message_taken', 'transferred', 'followup_needed', 'spam', 'unresolved', 'failed')),
  sentiment text
    check (sentiment in ('positive', 'neutral', 'confused', 'angry', 'urgent', 'unknown')),
  lead_qualification text
    check (lead_qualification in ('hot', 'warm', 'cold', 'not_a_fit', 'spam', 'unknown')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  transfer_result text,
  summary text,
  action_items_json jsonb not null default '[]'::jsonb,
  follow_up_status text not null default 'none'
    check (follow_up_status in ('none', 'needed', 'created', 'completed', 'dismissed')),
  estimated_provider_cost_cents numeric(12,4) not null default 0,
  billable_customer_amount_cents numeric(12,4) not null default 0,
  usage_units numeric(12,4) not null default 0,
  error_category text,
  safe_error_message text,
  idempotency_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, provider_call_id),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.receptionist_call_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  call_id uuid not null references public.receptionist_calls(id) on delete cascade,
  provider_key text not null,
  provider_event_id text,
  event_type text not null,
  event_status text not null default 'recorded'
    check (event_status in ('recorded', 'ignored', 'failed')),
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key, provider_event_id)
);

create table if not exists public.receptionist_call_transcripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  call_id uuid not null references public.receptionist_calls(id) on delete cascade,
  provider_key text not null,
  status text not null default 'available'
    check (status in ('pending', 'available', 'redacted', 'withheld', 'failed')),
  transcript_text text,
  redacted_transcript_text text,
  language text,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'granted', 'withheld', 'not_required')),
  confidence_score integer check (confidence_score between 0 and 100),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, call_id)
);

create table if not exists public.receptionist_call_recordings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  call_id uuid not null references public.receptionist_calls(id) on delete cascade,
  provider_key text not null,
  status text not null default 'withheld'
    check (status in ('pending', 'available', 'withheld', 'deleted', 'failed')),
  storage_provider text,
  storage_key text,
  provider_recording_id text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'granted', 'withheld', 'not_required')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, call_id, provider_recording_id)
);

create table if not exists public.usage_meter_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  plan_key text references public.billing_plans(plan_key) on delete set null,
  subscription_tenant_id uuid references public.billing_subscriptions(tenant_id) on delete set null,
  feature_key text not null,
  provider_key text not null,
  provider_resource_id text,
  provider_event_id text,
  source_table text,
  source_id text,
  unit_type text not null
    check (unit_type in ('second', 'minute', 'token', 'image', 'video_second', 'video_generation', 'message', 'email', 'gigabyte', 'phone_number_month', 'credit')),
  quantity numeric(14,4) not null check (quantity >= 0),
  provider_cost_cents numeric(14,4) not null default 0 check (provider_cost_cents >= 0),
  customer_charge_cents numeric(14,4) not null default 0 check (customer_charge_cents >= 0),
  currency text not null default 'usd',
  billing_period_start date not null default date_trunc('month', now())::date,
  billing_period_end date not null default (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  status text not null default 'unbilled'
    check (status in ('included', 'unbilled', 'pending_review', 'approved', 'queued_for_invoice', 'invoiced', 'paid', 'void', 'failed')),
  source text not null default 'system'
    check (source in ('provider_webhook', 'system', 'manual_adjustment', 'backfill', 'test')),
  idempotency_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, provider_key, provider_event_id, unit_type)
);

create table if not exists public.usage_allowance_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  plan_key text references public.billing_plans(plan_key) on delete cascade,
  feature_key text not null,
  unit_type text not null,
  included_quantity numeric(14,4) not null default 0 check (included_quantity >= 0),
  soft_limit_quantity numeric(14,4) check (soft_limit_quantity is null or soft_limit_quantity >= 0),
  hard_limit_quantity numeric(14,4) check (hard_limit_quantity is null or hard_limit_quantity >= 0),
  overage_mode text not null default 'notify_then_bill'
    check (overage_mode in ('notify_then_bill', 'prepaid_required', 'bundle_required', 'pause_ai', 'forward_to_business', 'take_message_only', 'notify_only')),
  overage_unit_price_cents numeric(14,4) not null default 0 check (overage_unit_price_cents >= 0),
  threshold_percentages int[] not null default array[50,75,90,100],
  status text not null default 'active'
    check (status in ('planned', 'active', 'paused', 'retired')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plan_key, feature_key, unit_type)
);

create table if not exists public.usage_bundles (
  id uuid primary key default gen_random_uuid(),
  bundle_key text not null unique,
  display_name text not null,
  feature_key text not null,
  unit_type text not null,
  included_quantity numeric(14,4) not null check (included_quantity > 0),
  price_cents integer,
  currency text not null default 'usd',
  recurrence text not null default 'one_time'
    check (recurrence in ('one_time', 'monthly')),
  expiration_policy text not null default 'period_end'
    check (expiration_policy in ('period_end', 'never', 'days_after_purchase')),
  eligible_plan_keys text[] not null default '{}'::text[],
  status text not null default 'planned'
    check (status in ('planned', 'available', 'active', 'paused', 'retired')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_bundle_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bundle_id uuid not null references public.usage_bundles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'depleted', 'expired', 'refunded', 'cancelled')),
  purchased_quantity numeric(14,4) not null check (purchased_quantity > 0),
  used_quantity numeric(14,4) not null default 0 check (used_quantity >= 0),
  stripe_invoice_id text,
  stripe_invoice_item_id text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spend_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  scope_type text not null default 'tenant'
    check (scope_type in ('global', 'tenant', 'feature', 'provider', 'user')),
  scope_key text,
  monthly_provider_cost_cap_cents numeric(14,4),
  monthly_customer_charge_cap_cents numeric(14,4),
  concurrent_call_limit integer check (concurrent_call_limit is null or concurrent_call_limit >= 0),
  max_call_duration_seconds integer check (max_call_duration_seconds is null or max_call_duration_seconds >= 0),
  emergency_paused boolean not null default false,
  failed_payment_behavior text not null default 'take_message_only'
    check (failed_payment_behavior in ('continue', 'notify_only', 'take_message_only', 'forward_to_business', 'pause_paid_ai')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'retired')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope_type, scope_key)
);

create index if not exists idx_provider_webhook_events_processing
  on public.provider_webhook_events(provider_key, processing_status, received_at desc);
create index if not exists idx_telephony_numbers_tenant
  on public.telephony_numbers(tenant_id, status, number_mode);
create index if not exists idx_receptionist_calls_tenant_started
  on public.receptionist_calls(tenant_id, started_at desc);
create index if not exists idx_receptionist_calls_outcome
  on public.receptionist_calls(tenant_id, outcome, status, started_at desc);
create index if not exists idx_usage_meter_events_tenant_period
  on public.usage_meter_events(tenant_id, billing_period_start, feature_key, unit_type);
create index if not exists idx_usage_meter_events_status
  on public.usage_meter_events(tenant_id, status, occurred_at desc);
create index if not exists idx_usage_bundle_purchases_tenant
  on public.usage_bundle_purchases(tenant_id, status, starts_at desc);

alter table public.provider_webhook_events enable row level security;
alter table public.telephony_numbers enable row level security;
alter table public.receptionist_calls enable row level security;
alter table public.receptionist_call_events enable row level security;
alter table public.receptionist_call_transcripts enable row level security;
alter table public.receptionist_call_recordings enable row level security;
alter table public.usage_meter_events enable row level security;
alter table public.usage_allowance_policies enable row level security;
alter table public.usage_bundles enable row level security;
alter table public.usage_bundle_purchases enable row level security;
alter table public.spend_limits enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'telephony_numbers',
    'receptionist_calls',
    'receptionist_call_events',
    'receptionist_call_transcripts',
    'receptionist_call_recordings',
    'usage_meter_events',
    'usage_bundle_purchases',
    'spend_limits'
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

drop policy if exists provider_webhook_events_tenant_operator on public.provider_webhook_events;
create policy provider_webhook_events_tenant_operator
on public.provider_webhook_events
for select
using (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists usage_allowance_policies_tenant_operator on public.usage_allowance_policies;
create policy usage_allowance_policies_tenant_operator
on public.usage_allowance_policies
for all
using (tenant_id is null or public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists usage_bundles_readable on public.usage_bundles;
create policy usage_bundles_readable
on public.usage_bundles
for select
using (status in ('available', 'active', 'planned'));

insert into public.usage_allowance_policies (
  tenant_id, plan_key, feature_key, unit_type, included_quantity, soft_limit_quantity,
  hard_limit_quantity, overage_mode, overage_unit_price_cents, status, metadata_json
)
select
  null,
  plan_key,
  'ai_receptionist',
  'minute',
  case plan_key
    when 'free' then 0
    when 'job_tracker' then 0
    when 'starter' then 25
    when 'growth' then 100
    when 'operator' then 300
    when 'managed_operator' then 500
    else 0
  end,
  case plan_key
    when 'starter' then 20
    when 'growth' then 80
    when 'operator' then 240
    when 'managed_operator' then 400
    else 0
  end,
  case plan_key
    when 'starter' then 200
    when 'growth' then 750
    when 'operator' then 2000
    when 'managed_operator' then 5000
    else 0
  end,
  case plan_key
    when 'free' then 'take_message_only'
    when 'job_tracker' then 'take_message_only'
    else 'notify_then_bill'
  end,
  0,
  'planned',
  '{"configuredAfterProviderCosts":true,"plainRule":"Included minutes and overage rates are configurable. Do not sell unlimited calling."}'::jsonb
from public.billing_plans
where plan_key in ('free', 'job_tracker', 'starter', 'growth', 'operator', 'managed_operator')
on conflict (tenant_id, plan_key, feature_key, unit_type) do update
set included_quantity = excluded.included_quantity,
    soft_limit_quantity = excluded.soft_limit_quantity,
    hard_limit_quantity = excluded.hard_limit_quantity,
    overage_mode = excluded.overage_mode,
    metadata_json = public.usage_allowance_policies.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.usage_allowance_policies (
  tenant_id, plan_key, feature_key, unit_type, included_quantity, soft_limit_quantity,
  hard_limit_quantity, overage_mode, overage_unit_price_cents, status, metadata_json
)
select
  null,
  plan_key,
  'premium_video',
  'video_generation',
  case plan_key when 'growth' then 1 when 'operator' then 3 when 'managed_operator' then 5 else 0 end,
  null,
  case plan_key when 'growth' then 3 when 'operator' then 10 when 'managed_operator' then 25 else 0 end,
  'bundle_required',
  0,
  'planned',
  '{"configuredAfterProviderCosts":true,"plainRule":"Video rendering is premium media. Scripts and briefs can be unlimited-feeling; rendered videos need limits or bundles."}'::jsonb
from public.billing_plans
where plan_key in ('free', 'job_tracker', 'starter', 'growth', 'operator', 'managed_operator')
on conflict (tenant_id, plan_key, feature_key, unit_type) do update
set included_quantity = excluded.included_quantity,
    hard_limit_quantity = excluded.hard_limit_quantity,
    overage_mode = excluded.overage_mode,
    metadata_json = public.usage_allowance_policies.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.usage_bundles (
  bundle_key, display_name, feature_key, unit_type, included_quantity, price_cents,
  recurrence, expiration_policy, eligible_plan_keys, status, metadata_json
)
values
  ('ai_receptionist_minutes_small', 'AI Receptionist Minute Bundle', 'ai_receptionist', 'minute', 100, null, 'one_time', 'period_end', array['starter','growth','operator','managed_operator'], 'planned', '{"priceTbd":true,"needsProviderCostReview":true}'::jsonb),
  ('premium_video_small', 'Premium Video Render Bundle', 'premium_video', 'video_generation', 5, null, 'one_time', 'period_end', array['growth','operator','managed_operator'], 'planned', '{"priceTbd":true,"needsProviderCostReview":true}'::jsonb),
  ('core_ai_credit_pack', 'AI Credit Bundle', 'core_ai', 'credit', 1000, null, 'one_time', 'period_end', array['starter','growth','operator','managed_operator'], 'planned', '{"priceTbd":true,"keepsNormalAiUnlimitedFeeling":true}'::jsonb)
on conflict (bundle_key) do update
set display_name = excluded.display_name,
    feature_key = excluded.feature_key,
    unit_type = excluded.unit_type,
    included_quantity = excluded.included_quantity,
    eligible_plan_keys = excluded.eligible_plan_keys,
    metadata_json = public.usage_bundles.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.ai_provider_configs (
  provider_key, display_name, provider_family, status, default_model,
  supports_text, supports_json, supports_vision, supports_image, supports_video, supports_voice,
  cost_category, priority, config_json
)
values
  ('vapi_voice', 'Vapi Voice Orchestration', 'voice_orchestrator', 'planned', null, false, false, false, false, false, true, 'premium_voice', 20, '{"purpose":"First recommended live AI receptionist adapter; can orchestrate telephony, voice, model, tools, and webhooks."}'::jsonb),
  ('retell_voice', 'Retell Voice Orchestration', 'voice_orchestrator', 'planned', null, false, false, false, false, false, true, 'premium_voice', 30, '{"purpose":"Second live AI receptionist adapter; strong production voice-agent and monitoring fit."}'::jsonb),
  ('twilio_voice', 'Twilio Voice', 'telephony', 'planned', null, false, false, false, false, false, true, 'premium_voice', 40, '{"purpose":"Phone numbers, call routing, PSTN, SIP handoff, and telephony webhooks."}'::jsonb),
  ('sip_trunk', 'SIP Trunk', 'telephony', 'planned', null, false, false, false, false, false, true, 'premium_voice', 45, '{"purpose":"Advanced bring-your-own existing phone system or SIP carrier route."}'::jsonb),
  ('openai_realtime', 'OpenAI Realtime', 'realtime_voice', 'planned', null, true, true, false, false, false, true, 'premium_voice', 50, '{"purpose":"Realtime listening/conversation brain for low-latency phone calls."}'::jsonb),
  ('deepgram_stt', 'Deepgram Speech-To-Text', 'speech_to_text', 'planned', null, false, false, false, false, false, true, 'premium_voice', 60, '{"purpose":"Streaming transcription/listening fallback or primary STT provider."}'::jsonb),
  ('openai_tts', 'OpenAI Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 70, '{"purpose":"Voice rendering for call responses or marketing voiceovers."}'::jsonb),
  ('elevenlabs_tts', 'ElevenLabs Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 80, '{"purpose":"Premium voice rendering for office manager speech or marketing voiceovers."}'::jsonb),
  ('cartesia_tts', 'Cartesia Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 90, '{"purpose":"Low-latency voice rendering option."}'::jsonb)
on conflict (provider_key) do update
set display_name = excluded.display_name,
    provider_family = excluded.provider_family,
    supports_voice = excluded.supports_voice,
    cost_category = excluded.cost_category,
    priority = excluded.priority,
    config_json = public.ai_provider_configs.config_json || excluded.config_json,
    updated_at = now();
