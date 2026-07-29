-- Phase 7: recruiting lifecycle, credential readiness, compensation rules,
-- and rollback-safe incumbent migration batches.

create table if not exists public.recruiting_job_openings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  department text,
  location text,
  employment_type text not null default 'employee'
    check (employment_type in ('employee', 'subcontractor', 'temporary', 'intern')),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paused', 'filled', 'closed')),
  description text,
  requirements_json jsonb not null default '[]'::jsonb,
  compensation_summary text,
  positions_available integer not null default 1 check (positions_available > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiting_applicants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opening_id uuid references public.recruiting_job_openings(id) on delete set null,
  name text not null,
  email text,
  phone text,
  source text,
  stage text not null default 'new'
    check (stage in ('new', 'screening', 'interview', 'reference_check', 'offer', 'hired', 'rejected', 'withdrawn')),
  skills_json jsonb not null default '[]'::jsonb,
  certifications_json jsonb not null default '[]'::jsonb,
  availability_summary text,
  resume_url text,
  ai_summary text,
  ai_score integer check (ai_score is null or ai_score between 0 and 100),
  ai_score_explanation text,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'granted', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiting_interviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  applicant_id uuid not null references public.recruiting_applicants(id) on delete cascade,
  interview_type text not null default 'screen'
    check (interview_type in ('screen', 'phone', 'video', 'in_person', 'skills', 'final')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  interviewer_user_id uuid references public.users(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'completed', 'canceled', 'no_show')),
  scorecard_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiting_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  applicant_id uuid not null references public.recruiting_applicants(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  position_title text not null,
  pay_type text not null default 'hourly'
    check (pay_type in ('hourly', 'salary', 'piece_rate', 'per_job', 'subcontractor')),
  pay_amount_cents integer not null default 0 check (pay_amount_cents >= 0),
  proposed_start_date date,
  expires_at timestamptz,
  terms text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete cascade,
  applicant_id uuid references public.recruiting_applicants(id) on delete cascade,
  task_key text not null,
  title text not null,
  required boolean not null default true,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'complete', 'waived', 'blocked')),
  due_at timestamptz,
  evidence_url text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_training_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  training_key text not null,
  title text not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed', 'expired', 'waived')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  evidence_url text,
  score numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  unique (worker_id, training_key)
);

create table if not exists public.worker_compensation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete cascade,
  role_type text,
  rule_type text not null
    check (rule_type in ('commission', 'bonus', 'piece_rate', 'reimbursement', 'prevailing_wage')),
  name text not null,
  calculation_type text not null
    check (calculation_type in ('fixed', 'percent_revenue', 'percent_gross_profit', 'per_unit', 'hourly_floor')),
  value numeric(14,4) not null default 0,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  rule_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_system text not null,
  entity_type text not null,
  original_file_name text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validating', 'needs_mapping', 'ready', 'applying', 'completed', 'partial', 'failed', 'rolled_back')),
  dry_run boolean not null default true,
  mapping_json jsonb not null default '{}'::jsonb,
  validation_summary_json jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  applied_rows integer not null default 0,
  idempotency_key text,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists data_import_batches_idempotency_unique
  on public.data_import_batches (tenant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.data_import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.data_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  source_key text,
  source_json jsonb not null default '{}'::jsonb,
  normalized_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'warning', 'invalid', 'duplicate', 'applied', 'failed', 'rolled_back')),
  validation_errors_json jsonb not null default '[]'::jsonb,
  created_record_type text,
  created_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table if not exists public.data_import_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.data_import_batches(id) on delete cascade,
  event_type text not null,
  summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recruiting_applicants_pipeline_idx
  on public.recruiting_applicants (tenant_id, stage, updated_at desc);
create index if not exists worker_onboarding_open_idx
  on public.worker_onboarding_tasks (tenant_id, status, due_at);
create index if not exists worker_training_expiry_idx
  on public.worker_training_records (tenant_id, status, expires_at);
create index if not exists data_import_batches_status_idx
  on public.data_import_batches (tenant_id, status, created_at desc);
create index if not exists data_import_rows_validation_idx
  on public.data_import_rows (tenant_id, batch_id, validation_status, row_number);

alter table public.recruiting_job_openings enable row level security;
alter table public.recruiting_applicants enable row level security;
alter table public.recruiting_interviews enable row level security;
alter table public.recruiting_offers enable row level security;
alter table public.worker_onboarding_tasks enable row level security;
alter table public.worker_training_records enable row level security;
alter table public.worker_compensation_rules enable row level security;
alter table public.data_import_batches enable row level security;
alter table public.data_import_rows enable row level security;
alter table public.data_import_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recruiting_job_openings', 'recruiting_applicants', 'recruiting_interviews',
    'recruiting_offers', 'worker_onboarding_tasks', 'worker_training_records',
    'worker_compensation_rules', 'data_import_batches', 'data_import_rows',
    'data_import_events'
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
