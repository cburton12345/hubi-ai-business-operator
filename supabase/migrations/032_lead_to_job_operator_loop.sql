create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  subject text not null,
  channel text not null default 'manual'
    check (channel in ('manual', 'sms', 'email', 'phone', 'web', 'internal')),
  status text not null default 'open'
    check (status in ('open', 'waiting_on_customer', 'waiting_on_team', 'closed', 'archived')),
  assigned_user_id uuid references public.users(id) on delete set null,
  next_follow_up_at timestamptz,
  unanswered_since timestamptz,
  provider_thread_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  direction text not null default 'internal'
    check (direction in ('inbound', 'outbound', 'internal', 'draft')),
  channel text not null default 'manual'
    check (channel in ('manual', 'sms', 'email', 'phone', 'web', 'internal')),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'customer_visible')),
  sender_label text,
  recipient_label text,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sent_manually', 'delivered', 'received', 'failed', 'archived')),
  ai_generated boolean not null default false,
  provider_message_id text,
  created_by_user_id uuid references public.users(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  name text not null,
  channel text not null default 'sms'
    check (channel in ('sms', 'email', 'manual')),
  purpose text not null
    check (purpose in ('new_lead_response', 'estimate_followup', 'callback_confirmation', 'appointment_reminder', 'review_request', 'invoice_followup', 'custom')),
  subject text,
  body text not null,
  active boolean not null default true,
  requires_approval boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, purpose, name)
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  stage_key text not null,
  name text not null,
  sort_order integer not null default 0,
  default_probability integer not null default 20 check (default_probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, stage_key)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  title text not null,
  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'archived')),
  value_cents integer not null default 0,
  close_probability integer not null default 25 check (close_probability between 0 and 100),
  expected_close_date date,
  next_follow_up_at timestamptz,
  callback_at timestamptz,
  source text,
  lost_reason text,
  ai_summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_stage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid references public.pipeline_stages(id) on delete set null,
  moved_by_user_id uuid references public.users(id) on delete set null,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.operator_schedule_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  event_type text not null
    check (event_type in ('callback', 'appointment', 'job', 'estimate_followup', 'review_request', 'internal')),
  title text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'missed', 'canceled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  external_calendar_provider text,
  external_calendar_event_id text,
  reminder_policy_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_communication_threads_tenant_status on public.communication_threads(tenant_id, status, next_follow_up_at);
create index if not exists idx_communication_threads_lead on public.communication_threads(lead_id);
create index if not exists idx_communication_messages_thread on public.communication_messages(thread_id, created_at desc);
create index if not exists idx_communication_templates_tenant on public.communication_templates(tenant_id, active, purpose);
create index if not exists idx_pipeline_stages_tenant_order on public.pipeline_stages(tenant_id, active, sort_order);
create index if not exists idx_opportunities_tenant_status on public.opportunities(tenant_id, status, next_follow_up_at);
create index if not exists idx_opportunities_stage on public.opportunities(stage_id, updated_at desc);
create index if not exists idx_opportunity_stage_events_opportunity on public.opportunity_stage_events(opportunity_id, created_at desc);
create index if not exists idx_operator_schedule_events_tenant on public.operator_schedule_events(tenant_id, status, starts_at);

alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_templates enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_events enable row level security;
alter table public.operator_schedule_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'communication_threads',
    'communication_messages',
    'communication_templates',
    'pipeline_stages',
    'opportunities',
    'opportunity_stage_events',
    'operator_schedule_events'
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

insert into public.pipeline_stages (tenant_id, stage_key, name, sort_order, default_probability, is_won, is_lost)
select
  t.id,
  defaults.stage_key,
  defaults.name,
  defaults.sort_order,
  defaults.default_probability,
  defaults.is_won,
  defaults.is_lost
from public.tenants t
cross join (
  values
    ('new', 'New lead', 10, 15, false, false),
    ('qualified', 'Qualified', 20, 35, false, false),
    ('estimate', 'Estimate sent', 30, 55, false, false),
    ('follow_up', 'Follow-up', 40, 65, false, false),
    ('won', 'Won', 90, 100, true, false),
    ('lost', 'Lost', 100, 0, false, true)
) as defaults(stage_key, name, sort_order, default_probability, is_won, is_lost)
on conflict (tenant_id, stage_key) do nothing;

insert into public.communication_templates (tenant_id, name, channel, purpose, subject, body, requires_approval, metadata_json)
select
  t.id,
  defaults.name,
  defaults.channel,
  defaults.purpose,
  defaults.subject,
  defaults.body,
  true,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('Speed-to-lead first response', 'sms', 'new_lead_response', null, 'Hi {{name}}, thanks for reaching out. We saw your request about {{service}} and can help. What is the best time to ask a few quick questions?', '{"providerReady":true}'::jsonb),
    ('Estimate follow-up', 'email', 'estimate_followup', 'Following up on your estimate', 'Hi {{name}}, I wanted to follow up on the estimate we sent. Do you have any questions or would you like help choosing the next step?', '{"providerReady":true}'::jsonb),
    ('Callback confirmation', 'sms', 'callback_confirmation', null, 'Confirmed: we will follow up at {{callback_time}}. Reply here if anything changes.', '{"providerReady":true}'::jsonb),
    ('Appointment reminder', 'sms', 'appointment_reminder', null, 'Reminder: your appointment is scheduled for {{appointment_time}}. Reply if you need to adjust timing.', '{"providerReady":true}'::jsonb)
) as defaults(name, channel, purpose, subject, body, metadata_json)
on conflict (tenant_id, purpose, name) do nothing;
