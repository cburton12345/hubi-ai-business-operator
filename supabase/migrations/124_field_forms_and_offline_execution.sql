-- Configurable field forms, completion requirements, signatures, and
-- idempotent offline mutation intake.

create table if not exists public.field_form_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  service_type_id uuid references public.service_types(id) on delete set null,
  name text not null,
  template_key text,
  description text,
  form_type text not null default 'job_checklist'
    check (form_type in ('job_checklist', 'inspection', 'safety', 'estimate', 'completion', 'customer_acknowledgment', 'custom')),
  version integer not null default 1 check (version > 0),
  schema_json jsonb not null default '{"fields":[]}'::jsonb,
  completion_policy text not null default 'required_fields'
    check (completion_policy in ('optional', 'required_fields', 'all_fields', 'approval_required')),
  customer_visible boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_field_form_template_version
  on public.field_form_templates(tenant_id, template_key, version)
  where template_key is not null;

create index if not exists idx_field_form_templates_service
  on public.field_form_templates(tenant_id, service_type_id, form_type, active);

create table if not exists public.field_form_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.field_form_templates(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete set null,
  status text not null default 'required'
    check (status in ('optional', 'required', 'in_progress', 'submitted', 'approved', 'rejected', 'waived')),
  due_at timestamptz,
  required_for_completion boolean not null default true,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  waived_at timestamptz,
  waiver_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, visit_id, worker_id)
);

create index if not exists idx_field_form_assignments_visit
  on public.field_form_assignments(tenant_id, visit_id, status);

create unique index if not exists uniq_field_form_assignment_scope
  on public.field_form_assignments(template_id, visit_id, coalesce(worker_id::text, ''));

create table if not exists public.field_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null references public.field_form_assignments(id) on delete cascade,
  template_id uuid not null references public.field_form_templates(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'needs_review', 'approved', 'rejected', 'superseded')),
  template_version integer not null,
  response_json jsonb not null default '{}'::jsonb,
  validation_errors_json jsonb not null default '[]'::jsonb,
  ai_summary text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_field_form_submissions_visit
  on public.field_form_submissions(tenant_id, visit_id, status, created_at desc);

create table if not exists public.field_form_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.field_form_submissions(id) on delete cascade,
  field_key text not null,
  attachment_type text not null
    check (attachment_type in ('photo', 'video', 'document', 'audio', 'signature')),
  file_url text,
  storage_key text,
  mime_type text,
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes >= 0),
  checksum text,
  caption text,
  ai_summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_field_form_attachments_submission
  on public.field_form_attachments(tenant_id, submission_id, field_key);

create table if not exists public.service_visit_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  submission_id uuid references public.field_form_submissions(id) on delete set null,
  signature_type text not null
    check (signature_type in ('customer_authorization', 'scope_change', 'work_completion', 'payment_authorization', 'worker_attestation', 'other')),
  signer_name text not null,
  signer_role text,
  signature_data_url text,
  signature_file_url text,
  statement_text text not null,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_visit_signatures_visit
  on public.service_visit_signatures(tenant_id, visit_id, signature_type, signed_at desc);

create table if not exists public.field_offline_mutations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete set null,
  visit_id uuid references public.service_visits(id) on delete set null,
  client_mutation_id text not null,
  mutation_type text not null
    check (mutation_type in ('visit_status', 'form_submission', 'time_entry', 'field_note', 'attachment_metadata', 'signature')),
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processing', 'applied', 'conflict', 'failed', 'rejected')),
  base_record_version text,
  server_record_version text,
  conflict_json jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_mutation_id)
);

create index if not exists idx_field_offline_mutations_status
  on public.field_offline_mutations(tenant_id, status, received_at);

alter table public.service_visits
  add column if not exists completion_readiness_status text not null default 'not_checked'
    check (completion_readiness_status in ('not_checked', 'ready', 'blocked', 'needs_review')),
  add column if not exists completion_readiness_json jsonb not null default '{}'::jsonb;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'field_form_templates',
    'field_form_assignments',
    'field_form_submissions',
    'field_form_attachments',
    'service_visit_signatures',
    'field_offline_mutations'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

-- A minimal default completion checklist. Workspaces can clone/version this
-- instead of editing submitted form history.
insert into public.field_form_templates (
  tenant_id, name, template_key, description, form_type, version,
  schema_json, completion_policy, customer_visible, metadata_json
)
select
  t.id,
  'Standard work completion',
  'standard-work-completion',
  'Required evidence before ordinary service work can be marked complete.',
  'completion',
  1,
  '{
    "fields": [
      {"key":"work_completed","type":"checkbox","label":"The approved work is complete","required":true},
      {"key":"completion_notes","type":"textarea","label":"What was completed?","required":true},
      {"key":"issues_found","type":"textarea","label":"Issues, changes, or follow-up needed","required":false},
      {"key":"completion_photo_url","type":"url","label":"Completion photo or proof link","required":true},
      {"key":"customer_updated","type":"checkbox","label":"The customer received an update","required":true}
    ]
  }'::jsonb,
  'required_fields',
  false,
  '{"seededBy":"124_field_forms_and_offline_execution"}'::jsonb
from public.tenants t
on conflict (tenant_id, template_key, version) where template_key is not null
do nothing;

insert into public.field_form_assignments (
  tenant_id, template_id, visit_id, status, required_for_completion, metadata_json
)
select
  v.tenant_id,
  ft.id,
  v.id,
  'required',
  true,
  '{"assignedBy":"default_completion_policy"}'::jsonb
from public.service_visits v
join public.field_form_templates ft
  on ft.tenant_id = v.tenant_id
 and ft.template_key = 'standard-work-completion'
 and ft.version = 1
where v.status not in ('completed','canceled','no_show')
on conflict do nothing;
