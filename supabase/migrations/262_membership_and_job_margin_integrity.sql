alter table public.recurring_service_plans
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists recurring_service_plans_membership_lifecycle_idx
  on public.recurring_service_plans (tenant_id,customer_id,status,renews_at,next_service_date);

comment on column public.recurring_service_plans.metadata_json is
  'Non-secret lifecycle provenance and idempotency evidence. Never stores provider credentials or payment instruments.';

create index if not exists operations_expenses_job_margin_idx
  on public.operations_expenses (tenant_id,service_job_id,assign_to,status)
  where service_job_id is not null;

create index if not exists operations_worker_payments_job_margin_idx
  on public.operations_worker_payments (tenant_id,service_job_id,status)
  where service_job_id is not null;

create index if not exists service_invoice_payments_job_margin_idx
  on public.service_invoice_payments (tenant_id,invoice_id,status);
