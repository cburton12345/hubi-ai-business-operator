-- Complete the Growth distribution foundation with durable event/version data,
-- cross-channel identity links, multi-touch attribution, policy, staged rollout,
-- and narrowly scoped assisted-connector sessions.

create table if not exists public.growth_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  strategy_key text not null,
  version integer not null check (version > 0),
  scoring_version text,
  prompt_version text,
  model_provider text,
  model_name text,
  configuration_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  effective_from timestamptz,
  effective_until timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, brand_id, strategy_key, version)
);

create table if not exists public.growth_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete cascade,
  policy_key text not null default 'default',
  rollout_stage integer not null default 1 check (rollout_stage between 1 and 5),
  priorities_json jsonb not null default '{}'::jsonb,
  geography_json jsonb not null default '{}'::jsonb,
  budget_json jsonb not null default '{}'::jsonb,
  brand_voice_json jsonb not null default '{}'::jsonb,
  approved_offers_json jsonb not null default '[]'::jsonb,
  approved_claims_json jsonb not null default '[]'::jsonb,
  prohibited_claims_json jsonb not null default '[]'::jsonb,
  channel_policy_json jsonb not null default '{}'::jsonb,
  community_policy_json jsonb not null default '{}'::jsonb,
  identity_policy_json jsonb not null default '{}'::jsonb,
  action_policy_json jsonb not null default '{}'::jsonb,
  posting_windows_json jsonb not null default '{}'::jsonb,
  risk_tolerance text not null default 'conservative' check (risk_tolerance in ('conservative', 'balanced', 'custom')),
  follow_up_policy_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, objective_id, policy_key)
);

alter table public.growth_distribution_identities
  add column if not exists identity_role text not null default 'distribution'
    check (identity_role in ('primary', 'distribution', 'personal')),
  add column if not exists connector_version text,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_warning_at timestamptz;

alter table public.growth_opportunities
  add column if not exists external_actor_id text,
  add column if not exists conversation_id uuid references public.messaging_conversations(id) on delete set null,
  add column if not exists campaign_reference text,
  add column if not exists content_reference text,
  add column if not exists strategy_version_id uuid references public.growth_strategy_versions(id) on delete set null,
  add column if not exists idempotency_key text;

alter table public.growth_action_attempts
  add column if not exists idempotency_key text,
  add column if not exists strategy_version_id uuid references public.growth_strategy_versions(id) on delete set null,
  add column if not exists model_provider text,
  add column if not exists prompt_version text,
  add column if not exists strategy_version text,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists next_attempt_at timestamptz;

create unique index if not exists growth_opportunities_idempotency_unique
  on public.growth_opportunities(tenant_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists growth_action_attempts_idempotency_unique
  on public.growth_action_attempts(tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.growth_contact_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  channel_key text not null,
  provider_key text,
  external_actor_id text not null,
  display_name text,
  profile_url text,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  match_confidence integer not null default 0 check (match_confidence between 0 and 100),
  match_status text not null default 'unlinked' check (match_status in ('unlinked', 'suggested', 'confirmed', 'rejected')),
  match_method text not null default 'channel_identifier'
    check (match_method in ('channel_identifier', 'provided_phone', 'provided_email', 'owner_confirmed', 'customer_confirmed', 'imported', 'unknown')),
  provenance_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_key, provider_key, external_actor_id)
);

create table if not exists public.growth_connector_capability_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  identity_id uuid not null references public.growth_distribution_identities(id) on delete cascade,
  capability_key text not null,
  support_mode text not null check (support_mode in ('official', 'assisted', 'manual', 'unsupported')),
  authentication_requirement text,
  inbound_event_keys text[] not null default array[]::text[],
  approval_requirement text not null default 'policy' check (approval_requirement in ('none', 'policy', 'always')),
  rate_policy_json jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown' check (health_status in ('unknown', 'healthy', 'degraded', 'unavailable')),
  available boolean not null default false,
  last_checked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, identity_id, capability_key)
);

create table if not exists public.growth_connector_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  identity_id uuid not null references public.growth_distribution_identities(id) on delete cascade,
  device_id_hash text not null,
  token_hash text not null unique,
  scope_keys text[] not null default array[]::text[],
  connector_version text,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  issued_by_user_id uuid references public.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete set null,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  community_id uuid references public.growth_communities(id) on delete set null,
  opportunity_id uuid references public.growth_opportunities(id) on delete set null,
  action_attempt_id uuid references public.growth_action_attempts(id) on delete set null,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  event_type text not null,
  channel_key text,
  content_reference text,
  campaign_reference text,
  action_type text,
  automation_mode text,
  model_provider text,
  model_name text,
  strategy_version text,
  prompt_version text,
  outcome text,
  failure_reason text,
  owner_intervention text,
  attribution_json jsonb not null default '{}'::jsonb,
  dimensions_json jsonb not null default '{}'::jsonb,
  raw_event_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create unique index if not exists growth_events_idempotency_unique
  on public.growth_events(tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.growth_attribution_touches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete set null,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  community_id uuid references public.growth_communities(id) on delete set null,
  opportunity_id uuid references public.growth_opportunities(id) on delete set null,
  action_attempt_id uuid references public.growth_action_attempts(id) on delete set null,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  invoice_id uuid references public.service_invoices(id) on delete set null,
  channel_key text,
  source_name text,
  campaign_reference text,
  content_reference text,
  touch_role text not null default 'assist' check (touch_role in ('first', 'assist', 'last', 'conversion')),
  pipeline_value_cents integer not null default 0,
  won_revenue_cents integer not null default 0,
  reference_key text not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  unique (tenant_id, reference_key)
);

alter table public.messaging_conversations drop constraint if exists messaging_conversations_channel_check;
alter table public.messaging_conversations add constraint messaging_conversations_channel_check
  check (channel in ('sms', 'mms', 'email', 'phone', 'manual_sms', 'website_chat', 'app_push', 'internal',
    'facebook_messenger', 'instagram', 'reddit', 'linkedin', 'x', 'nextdoor', 'craigslist', 'google_business_profile'));

alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel in ('sms', 'mms', 'email', 'phone', 'manual_sms', 'website_chat', 'app_push', 'internal',
    'facebook_messenger', 'instagram', 'reddit', 'linkedin', 'x', 'nextdoor', 'craigslist', 'google_business_profile'));

create index if not exists growth_events_analysis_idx on public.growth_events(tenant_id, event_type, occurred_at desc);
create index if not exists growth_events_dimensions_idx on public.growth_events(tenant_id, objective_id, channel_key, occurred_at desc);
create index if not exists growth_contact_identities_link_idx on public.growth_contact_identities(tenant_id, lead_id, customer_id, match_status);
create index if not exists growth_attribution_touches_lead_idx on public.growth_attribution_touches(tenant_id, lead_id, occurred_at);
create index if not exists growth_attribution_touches_objective_idx on public.growth_attribution_touches(tenant_id, objective_id, occurred_at);
create index if not exists growth_connector_sessions_active_idx on public.growth_connector_sessions(tenant_id, identity_id, status, expires_at);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'growth_strategy_versions', 'growth_policies', 'growth_contact_identities',
    'growth_connector_capability_states', 'growth_connector_sessions', 'growth_events', 'growth_attribution_touches'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

-- Connector sessions contain hashed bearer material and are server-managed only.
drop policy if exists growth_connector_sessions_tenant_operator on public.growth_connector_sessions;

insert into public.growth_policies (tenant_id, brand_id, policy_key, rollout_stage, risk_tolerance, action_policy_json)
select b.tenant_id, b.id, 'default', 1, 'conservative',
  '{"stage1":"observe","stage2":"suggest","stage3":"approval_required","stage4":"limited_autopilot","stage5":"policy_autopilot"}'::jsonb
from public.brands b where b.status = 'active'
on conflict (tenant_id, brand_id, objective_id, policy_key) do nothing;

update public.workspace_feature_entitlements
set metadata_json = metadata_json || '{"rolloutStage":1,"rolloutLabel":"Observe and discover only","dogfoodRequired":true}'::jsonb,
    updated_at = now()
where feature_key = 'growth_distribution_engine';

-- Carry an attributed Growth lead through the existing estimate/job/invoice
-- machinery without adding a second sales pipeline.
create or replace function public.sync_growth_estimate_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare origin public.growth_attribution_touches%rowtype;
begin
  if new.source_lead_id is null then return new; end if;
  select * into origin from public.growth_attribution_touches
    where tenant_id = new.tenant_id and lead_id = new.source_lead_id
    order by occurred_at asc limit 1;
  if origin.id is null then return new; end if;
  insert into public.growth_attribution_touches (
    tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, action_attempt_id,
    conversation_id, lead_id, customer_id, estimate_id, channel_key, source_name, campaign_reference,
    content_reference, touch_role, pipeline_value_cents, reference_key, metadata_json
  ) values (
    new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
    origin.opportunity_id, origin.action_attempt_id, origin.conversation_id, new.source_lead_id,
    new.customer_id, new.id, origin.channel_key, origin.source_name, origin.campaign_reference,
    origin.content_reference, 'conversion', case when new.status in ('sent_manually','approved') then new.total_cents else 0 end,
    'growth-estimate:' || new.id::text, jsonb_build_object('estimateStatus',new.status)
  ) on conflict (tenant_id, reference_key) do update set
    pipeline_value_cents = excluded.pipeline_value_cents, metadata_json = excluded.metadata_json, occurred_at = now();
  insert into public.growth_events (
    tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, conversation_id, lead_id,
    customer_id, event_type, channel_key, outcome, attribution_json, idempotency_key
  ) values (
    new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
    origin.opportunity_id, origin.conversation_id, new.source_lead_id, new.customer_id, 'estimate_created',
    origin.channel_key, new.status, jsonb_build_object('estimateId',new.id,'pipelineValueCents',new.total_cents),
    'growth-estimate-event:' || new.id::text || ':' || new.status
  ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end $$;

drop trigger if exists service_estimates_growth_attribution on public.service_estimates;
create trigger service_estimates_growth_attribution
after insert or update of status, total_cents on public.service_estimates
for each row execute function public.sync_growth_estimate_attribution();

create or replace function public.sync_growth_job_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare origin public.growth_attribution_touches%rowtype;
begin
  if new.source_lead_id is null then return new; end if;
  select * into origin from public.growth_attribution_touches
    where tenant_id = new.tenant_id and lead_id = new.source_lead_id
    order by occurred_at asc limit 1;
  if origin.id is null then return new; end if;
  insert into public.growth_attribution_touches (
    tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, action_attempt_id,
    conversation_id, lead_id, customer_id, estimate_id, job_id, channel_key, source_name,
    campaign_reference, content_reference, touch_role, pipeline_value_cents, reference_key, metadata_json
  ) values (
    new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
    origin.opportunity_id, origin.action_attempt_id, origin.conversation_id, new.source_lead_id,
    new.customer_id, new.estimate_id, new.id, origin.channel_key, origin.source_name,
    origin.campaign_reference, origin.content_reference, 'conversion',
    coalesce((select total_cents from public.service_estimates where id = new.estimate_id),0),
    'growth-job:' || new.id::text, jsonb_build_object('jobStatus',new.status)
  ) on conflict (tenant_id, reference_key) do update set metadata_json = excluded.metadata_json, occurred_at = now();
  insert into public.growth_events (
    tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, conversation_id, lead_id,
    customer_id, event_type, channel_key, outcome, attribution_json, idempotency_key
  ) values (
    new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
    origin.opportunity_id, origin.conversation_id, new.source_lead_id, new.customer_id, 'job_created',
    origin.channel_key, new.status, jsonb_build_object('jobId',new.id,'estimateId',new.estimate_id),
    'growth-job-event:' || new.id::text || ':' || new.status
  ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end $$;

drop trigger if exists service_jobs_growth_attribution on public.service_jobs;
create trigger service_jobs_growth_attribution
after insert or update of status on public.service_jobs
for each row execute function public.sync_growth_job_attribution();

create or replace function public.sync_growth_invoice_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare origin public.growth_attribution_touches%rowtype;
declare linked_lead_id uuid;
begin
  select coalesce(j.source_lead_id,e.source_lead_id) into linked_lead_id
  from public.service_invoices i
  left join public.service_jobs j on j.id = i.job_id and j.tenant_id = i.tenant_id
  left join public.service_estimates e on e.id = i.estimate_id and e.tenant_id = i.tenant_id
  where i.id = new.id;
  if linked_lead_id is null then return new; end if;
  select * into origin from public.growth_attribution_touches
    where tenant_id = new.tenant_id and lead_id = linked_lead_id
    order by occurred_at asc limit 1;
  if origin.id is null then return new; end if;
  insert into public.growth_attribution_touches (
    tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, action_attempt_id,
    conversation_id, lead_id, customer_id, estimate_id, job_id, invoice_id, channel_key, source_name,
    campaign_reference, content_reference, touch_role, pipeline_value_cents, won_revenue_cents, reference_key, metadata_json
  ) values (
    new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
    origin.opportunity_id, origin.action_attempt_id, origin.conversation_id, linked_lead_id,
    new.customer_id, new.estimate_id, new.job_id, new.id, origin.channel_key, origin.source_name,
    origin.campaign_reference, origin.content_reference, 'conversion', new.total_cents,
    case when new.status in ('paid','partially_paid') then new.amount_paid_cents else 0 end,
    'growth-invoice:' || new.id::text, jsonb_build_object('invoiceStatus',new.status)
  ) on conflict (tenant_id, reference_key) do update set
    pipeline_value_cents = excluded.pipeline_value_cents, won_revenue_cents = excluded.won_revenue_cents,
    metadata_json = excluded.metadata_json, occurred_at = now();
  if new.amount_paid_cents > 0 then
    insert into public.growth_events (
      tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, conversation_id, lead_id,
      customer_id, event_type, channel_key, outcome, attribution_json, idempotency_key
    ) values (
      new.tenant_id, new.brand_id, origin.objective_id, origin.identity_id, origin.community_id,
      origin.opportunity_id, origin.conversation_id, linked_lead_id, new.customer_id, 'revenue_attributed',
      origin.channel_key, new.status, jsonb_build_object('invoiceId',new.id,'wonRevenueCents',new.amount_paid_cents),
      'growth-revenue-event:' || new.id::text || ':' || new.amount_paid_cents::text
    ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;
  return new;
end $$;

drop trigger if exists service_invoices_growth_attribution on public.service_invoices;
create trigger service_invoices_growth_attribution
after insert or update of status, total_cents, amount_paid_cents on public.service_invoices
for each row execute function public.sync_growth_invoice_attribution();
