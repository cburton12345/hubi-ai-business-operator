-- Idempotent mobile workforce facts. These keys allow a phone to retry after
-- losing service without creating a second expense or worker payment.

alter table public.operations_expenses
  add column if not exists client_mutation_id text;

alter table public.operations_worker_payments
  add column if not exists client_mutation_id text;

alter table public.operations_location_pings
  add column if not exists client_mutation_id text;

create unique index if not exists uniq_operations_expenses_client_mutation
  on public.operations_expenses (tenant_id,client_mutation_id)
  where client_mutation_id is not null;

create unique index if not exists uniq_worker_payments_client_mutation
  on public.operations_worker_payments (tenant_id,client_mutation_id)
  where client_mutation_id is not null;

create unique index if not exists uniq_location_pings_client_mutation
  on public.operations_location_pings (tenant_id,client_mutation_id)
  where client_mutation_id is not null;

comment on column public.operations_expenses.client_mutation_id is
  'Device-generated idempotency key for online/offline worker expense retries.';

comment on column public.operations_worker_payments.client_mutation_id is
  'Device-generated idempotency key for owner-recorded worker payment retries.';

comment on column public.operations_location_pings.client_mutation_id is
  'Device-generated idempotency key paired to an explicit workforce action.';
