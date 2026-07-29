create table if not exists public.revenue_lead_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  qualification_status text not null default 'needs_review'
    check (qualification_status in ('qualified', 'needs_review', 'nurture', 'disqualified', 'spam')),
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  urgency_score integer not null default 0 check (urgency_score between 0 and 100),
  estimated_value_cents integer not null default 0 check (estimated_value_cents >= 0),
  recommended_next_action text not null default 'Review the lead and choose the next step.',
  qualification_reason text,
  disqualification_reason text,
  scoring_inputs_json jsonb not null default '{}'::jsonb,
  last_scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, lead_id)
);

create table if not exists public.revenue_attribution_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  invoice_id uuid references public.service_invoices(id) on delete set null,
  payment_id uuid references public.service_invoice_payments(id) on delete set null,
  entity_type text not null
    check (entity_type in ('lead', 'appointment', 'estimate', 'job', 'invoice', 'payment', 'refund', 'review')),
  entity_id uuid not null,
  original_source text,
  latest_source text,
  campaign_key text,
  ad_platform text,
  ad_set_id text,
  ad_id text,
  landing_page text,
  referral_source text,
  search_term text,
  tracking_number text,
  attribution_model text not null default 'first_touch'
    check (attribution_model in ('first_touch', 'last_touch', 'multi_touch', 'manual')),
  pipeline_value_cents integer not null default 0 check (pipeline_value_cents >= 0),
  signed_sale_cents integer not null default 0 check (signed_sale_cents >= 0),
  invoiced_cents integer not null default 0 check (invoiced_cents >= 0),
  collected_cents integer not null default 0 check (collected_cents >= 0),
  gross_profit_cents integer,
  touchpoints_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_type, entity_id, attribution_model)
);

create table if not exists public.revenue_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  appointment_type text not null default 'sales'
    check (appointment_type in ('sales', 'estimate', 'consultation', 'service', 'follow_up', 'other')),
  status text not null default 'booked'
    check (status in ('requested', 'booked', 'confirmed', 'showed', 'no_show', 'rescheduled', 'canceled', 'completed')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  showed_at timestamptz,
  no_show_reason text,
  confirmation_status text not null default 'not_sent'
    check (confirmation_status in ('not_sent', 'sent', 'confirmed', 'declined', 'failed')),
  booking_source text,
  show_sequence_key text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  appointment_id uuid references public.revenue_appointments(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null default 'email'
    check (channel in ('email', 'sms', 'push', 'manual_call', 'task')),
  reminder_key text not null default 'custom',
  status text not null default 'planned'
    check (status in ('planned', 'needs_approval', 'queued', 'sent', 'failed', 'canceled', 'skipped')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  message_draft text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_followup_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  sequence_key text not null,
  name text not null,
  trigger_type text not null
    check (trigger_type in ('new_lead', 'qualified_lead', 'appointment_booked', 'appointment_missed', 'estimate_sent', 'estimate_viewed', 'estimate_not_viewed', 'no_response', 'price_objection', 'financing_interest', 'lost_opportunity', 'not_yet', 'seasonal', 'past_customer')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  approval_required boolean not null default true,
  stop_conditions_json jsonb not null default '["reply_detected","appointment_booked","sale_detected","opt_out"]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, sequence_key)
);

create table if not exists public.revenue_followup_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null references public.revenue_followup_sequences(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  channel text not null default 'task'
    check (channel in ('email', 'sms', 'push', 'manual_call', 'task')),
  action_label text not null,
  message_template text,
  approval_required boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_number)
);

create table if not exists public.revenue_followup_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  sequence_id uuid references public.revenue_followup_sequences(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  invoice_id uuid references public.service_invoices(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'stopped', 'opted_out', 'archived')),
  current_step integer not null default 1 check (current_step > 0),
  next_step_due_at timestamptz,
  stop_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  goal_name text not null default 'Monthly revenue goal',
  period_start date not null default date_trunc('month', current_date)::date,
  period_end date not null default (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  target_collected_revenue_cents integer not null default 0 check (target_collected_revenue_cents >= 0),
  target_profit_cents integer not null default 0 check (target_profit_cents >= 0),
  target_leads integer not null default 0 check (target_leads >= 0),
  target_qualified_leads integer not null default 0 check (target_qualified_leads >= 0),
  target_appointments integer not null default 0 check (target_appointments >= 0),
  target_show_rate_bps integer not null default 7000 check (target_show_rate_bps between 0 and 10000),
  target_close_rate_bps integer not null default 3000 check (target_close_rate_bps between 0 and 10000),
  target_average_sale_cents integer not null default 0 check (target_average_sale_cents >= 0),
  target_review_count integer not null default 0 check (target_review_count >= 0),
  assumptions_json jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  recommendation_key text not null,
  problem text not null,
  supporting_data text not null,
  estimated_revenue_impact_cents integer not null default 0,
  recommended_action text not null,
  confidence_level text not null default 'medium'
    check (confidence_level in ('low', 'medium', 'high')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'approved', 'dismissed', 'snoozed', 'completed', 'archived')),
  action_href text,
  snoozed_until timestamptz,
  source_metrics_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, recommendation_key)
);

create table if not exists public.revenue_conversion_event_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  event_key text not null,
  event_type text not null
    check (event_type in ('qualified_lead', 'appointment_booked', 'appointment_showed', 'estimate_sent', 'sale_closed', 'payment_collected', 'high_profit_customer')),
  provider text not null default 'provider_agnostic',
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'queued', 'sent', 'failed', 'skipped', 'canceled')),
  consent_checked boolean not null default false,
  requires_manual_approval boolean not null default true,
  idempotency_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, idempotency_key)
);

create table if not exists public.revenue_qualification_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  service_label text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  disqualification_rules_json jsonb not null default '[]'::jsonb,
  routing_rules_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_qualification_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.revenue_qualification_forms(id) on delete cascade,
  question_order integer not null default 1,
  label text not null,
  question_type text not null default 'text'
    check (question_type in ('text', 'single_choice', 'multi_choice', 'number', 'currency', 'date', 'phone', 'email', 'boolean')),
  required boolean not null default false,
  scoring_json jsonb not null default '{}'::jsonb,
  conditional_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.revenue_case_studies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'needs_approval', 'approved', 'published', 'archived')),
  time_period text,
  starting_condition text,
  testimonial text,
  consent_status text not null default 'not_requested'
    check (consent_status in ('not_requested', 'requested', 'approved', 'declined', 'expired')),
  disclaimer text,
  typicality text not null default 'not_claimed'
    check (typicality in ('not_claimed', 'typical', 'exceptional', 'unknown')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revenue_case_study_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_study_id uuid not null references public.revenue_case_studies(id) on delete cascade,
  metric_key text not null,
  before_value numeric,
  after_value numeric,
  unit text,
  context text,
  created_at timestamptz not null default now()
);

create index if not exists idx_revenue_lead_scores_tenant
  on public.revenue_lead_scores(tenant_id, brand_id, qualification_status, qualification_score desc, last_scored_at desc);
create index if not exists idx_revenue_attribution_tenant_source
  on public.revenue_attribution_records(tenant_id, original_source, occurred_at desc);
create index if not exists idx_revenue_appointments_tenant_status
  on public.revenue_appointments(tenant_id, brand_id, status, scheduled_start);
create index if not exists idx_revenue_recommendations_tenant
  on public.revenue_recommendations(tenant_id, brand_id, status, priority, created_at desc);
create index if not exists idx_revenue_conversion_queue_tenant
  on public.revenue_conversion_event_queue(tenant_id, provider, status, created_at desc);
create index if not exists idx_revenue_goals_tenant_period
  on public.revenue_goals(tenant_id, brand_id, status, period_start, period_end);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'revenue_lead_scores',
    'revenue_attribution_records',
    'revenue_appointments',
    'revenue_appointment_reminders',
    'revenue_followup_sequences',
    'revenue_followup_steps',
    'revenue_followup_enrollments',
    'revenue_goals',
    'revenue_recommendations',
    'revenue_conversion_event_queue',
    'revenue_qualification_forms',
    'revenue_qualification_questions',
    'revenue_case_studies',
    'revenue_case_study_metrics'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

do $$
begin
  if to_regclass('public.workspace_feature_entitlements') is not null then
    insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
    select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
    from public.tenants t
    cross join (
      values
        ('revenue_growth_engine', 'enabled', 1000, 'monthly', '{"category":"Revenue","description":"Closed-loop revenue dashboard from source to qualified appointment, sale, collected payment, profit, review, and repeat work.","approvalMode":"enabled","plainRule":"Show where money is leaking and what to do next.","costed":true,"publicFacing":true}'::jsonb),
        ('revenue_ad_feedback_queue', 'limited', 250, 'monthly', '{"category":"Revenue","description":"Provider-agnostic conversion event queue for future ad-platform feedback.","approvalMode":"review_required","plainRule":"Queue conversion events only after consent and approval.","costed":true,"publicFacing":false}'::jsonb)
    ) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
    where t.status <> 'archived'
    on conflict (tenant_id, feature_key) do update set
      status = excluded.status,
      usage_limit = excluded.usage_limit,
      usage_period = excluded.usage_period,
      metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
      updated_at = now();
  end if;
end $$;
