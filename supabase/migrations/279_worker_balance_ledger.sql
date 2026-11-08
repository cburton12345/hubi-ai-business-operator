-- Unapplied: reviewable worker advances/purchases ledger. This migration never changes worked hours
-- and never initiates payroll or bank movement.

alter table public.employee_cash_advances
  add column if not exists entry_kind text not null default 'cash_advance'
    check (entry_kind in ('cash_advance','personal_purchase','gift','business_expense','reimbursement','loss_damage')),
  add column if not exists currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  add column if not exists is_worker_debt boolean not null default true,
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  add column if not exists worker_authorization_status text not null default 'pending'
    check (worker_authorization_status in ('pending','authorized','declined','disputed')),
  add column if not exists repayment_terms text,
  add column if not exists receipt_url text,
  add column if not exists approved_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists reversed_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

alter table public.employee_cash_advances
  drop constraint if exists employee_cash_advances_non_debt_kind_check;
alter table public.employee_cash_advances
  add constraint employee_cash_advances_non_debt_kind_check check (
    (entry_kind in ('gift','business_expense','reimbursement','loss_damage') and is_worker_debt = false)
    or (entry_kind in ('cash_advance','personal_purchase') and is_worker_debt = true)
  );

create table if not exists public.employee_advance_repayments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advance_id uuid not null references public.employee_cash_advances(id) on delete restrict,
  worker_id uuid not null references public.operations_workers(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  repaid_at date not null default current_date,
  repayment_method text not null default 'cash'
    check (repayment_method in ('cash','check','bank_transfer','payroll_deduction','other')),
  status text not null default 'recorded' check (status in ('recorded','reversed')),
  note text,
  idempotency_key text not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  reversed_by_user_id uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.employee_advance_pay_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advance_id uuid not null references public.employee_cash_advances(id) on delete restrict,
  worker_id uuid not null references public.operations_workers(id) on delete restrict,
  pay_period_start date not null,
  pay_period_end date not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'proposed' check (status in ('proposed','confirmed','reversed')),
  worker_authorization_evidence text,
  legal_policy_review text,
  manager_confirmed_by_user_id uuid references public.users(id) on delete set null,
  manager_confirmed_at timestamptz,
  idempotency_key text not null,
  reversal_reason text,
  reversed_by_user_id uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (pay_period_end >= pay_period_start),
  check (status <> 'confirmed' or (
    manager_confirmed_by_user_id is not null and manager_confirmed_at is not null
    and nullif(btrim(worker_authorization_evidence),'') is not null
    and nullif(btrim(legal_policy_review),'') is not null
  )),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.employee_advance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advance_id uuid not null references public.employee_cash_advances(id) on delete restrict,
  worker_id uuid not null references public.operations_workers(id) on delete restrict,
  event_type text not null check (event_type in (
    'created','submitted','approved','rejected','worker_authorized','worker_disputed',
    'repayment_recorded','repayment_reversed','allocation_proposed','allocation_confirmed',
    'allocation_reversed','corrected','reversed'
  )),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_worker_id uuid references public.operations_workers(id) on delete set null,
  note text,
  previous_state_json jsonb not null default '{}'::jsonb,
  new_state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Fail closed if a partial/custom prior install contains cross-tenant or cross-worker
-- child rows. Review those records manually rather than rewriting financial evidence.
do $$
begin
  if exists (
    select 1 from public.employee_advance_repayments child
    left join public.employee_cash_advances advance
      on advance.tenant_id=child.tenant_id and advance.id=child.advance_id and advance.worker_id=child.worker_id
    where advance.id is null
  ) or exists (
    select 1 from public.employee_advance_pay_allocations child
    left join public.employee_cash_advances advance
      on advance.tenant_id=child.tenant_id and advance.id=child.advance_id and advance.worker_id=child.worker_id
    where advance.id is null
  ) or exists (
    select 1 from public.employee_advance_events child
    left join public.employee_cash_advances advance
      on advance.tenant_id=child.tenant_id and advance.id=child.advance_id and advance.worker_id=child.worker_id
    where advance.id is null
  ) then
    raise exception 'Worker balance child identity mismatch; review tenant/advance/worker evidence before migration 279.';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='employee_cash_advances_tenant_id_worker_key' and conrelid='public.employee_cash_advances'::regclass) then
    alter table public.employee_cash_advances
      add constraint employee_cash_advances_tenant_id_worker_key unique (tenant_id,id,worker_id);
  end if;
end $$;

do $$
declare target text;
declare constraint_name text;
begin
  foreach target in array array['employee_advance_repayments','employee_advance_pay_allocations','employee_advance_events'] loop
    constraint_name := target || '_advance_identity_fkey';
    if not exists (select 1 from pg_constraint where conname=constraint_name and conrelid=format('public.%I',target)::regclass) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id,advance_id,worker_id) references public.employee_cash_advances(tenant_id,id,worker_id) on delete restrict',
        target,constraint_name
      );
    end if;
  end loop;
end $$;

create index if not exists idx_employee_advance_repayments_balance
  on public.employee_advance_repayments(tenant_id, advance_id, status, repaid_at);
create index if not exists idx_employee_advance_allocations_period
  on public.employee_advance_pay_allocations(tenant_id, worker_id, pay_period_start, pay_period_end, status);
create index if not exists idx_employee_advance_events_history
  on public.employee_advance_events(tenant_id, advance_id, created_at desc);

alter table public.employee_advance_repayments enable row level security;
alter table public.employee_advance_pay_allocations enable row level security;
alter table public.employee_advance_events enable row level security;

do $validate_employee_cash_advances_operator$
declare actual record; normalized_qual text; normalized_check text;
begin
  select p.* into actual from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename='employee_cash_advances'
    and p.policyname='employee_cash_advances_operator';
  if actual.policyname is null or actual.cmd<>'ALL' or actual.permissive<>'PERMISSIVE'
    or actual.roles<>array['public']::name[] then
    raise exception 'Worker balance hardening found a noncanonical employee_cash_advances_operator policy; inventory its consumer before applying migration 279.';
  end if;
  normalized_qual := regexp_replace(replace(replace(lower(coalesce(actual.qual,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  normalized_check := regexp_replace(replace(replace(lower(coalesce(actual.with_check,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  if normalized_qual<> 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']'
    or normalized_check<> 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']' then
    raise exception 'Worker balance hardening found customized employee_cash_advances_operator semantics; inventory its consumer before applying migration 279.';
  end if;
end
$validate_employee_cash_advances_operator$;

drop policy if exists employee_cash_advances_operator on public.employee_cash_advances;
drop policy if exists employee_cash_advances_tenant_read on public.employee_cash_advances;
create policy employee_cash_advances_tenant_read on public.employee_cash_advances for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

do $$
declare target text;
begin
  foreach target in array array['employee_advance_repayments','employee_advance_pay_allocations','employee_advance_events'] loop
    execute format('drop policy if exists %I on public.%I', target || '_tenant_read', target);
    execute format(
      'create policy %I on public.%I for select using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      target || '_tenant_read', target
    );
    execute format('drop policy if exists %I on public.%I', target || '_self_read', target);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.operations_workers w where w.id=%I.worker_id and w.tenant_id=%I.tenant_id and w.user_id=public.current_app_user_id() and public.has_tenant_role(%I.tenant_id, array[''viewer'',''operator'',''admin'',''owner''])))',
      target || '_self_read', target, target, target, target
    );
  end loop;
end $$;

revoke insert, update, delete, truncate, references, trigger
  on public.employee_cash_advances, public.employee_advance_repayments,
     public.employee_advance_pay_allocations, public.employee_advance_events
  from public, anon, authenticated;

-- Keep each new table's Data API boundary explicit for release validation.
revoke all privileges on public.employee_advance_repayments from public, anon, authenticated;
grant select on public.employee_advance_repayments to authenticated;
revoke all privileges on public.employee_advance_pay_allocations from public, anon, authenticated;
grant select on public.employee_advance_pay_allocations to authenticated;
revoke all privileges on public.employee_advance_events from public, anon, authenticated;
grant select on public.employee_advance_events to authenticated;

-- Table-level revocation does not remove privileges that were granted on individual
-- columns. Remove those paths explicitly so browser roles cannot bypass RLS through
-- an inherited/legacy column grant.
do $$
declare
  target text;
  columns_sql text;
begin
  foreach target in array array[
    'employee_cash_advances','employee_advance_repayments',
    'employee_advance_pay_allocations','employee_advance_events'
  ] loop
    select string_agg(format('%I',attribute.attname), ', ' order by attribute.attnum)
      into columns_sql
    from pg_attribute attribute
    where attribute.attrelid = format('public.%I',target)::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped;
    execute format(
      'revoke insert (%s), update (%s) on public.%I from public, anon, authenticated',
      columns_sql, columns_sql, target
    );
  end loop;
end $$;

comment on table public.employee_advance_repayments is
  'Append-only worker balance repayments. Reversals retain the original evidence.';
comment on table public.employee_advance_pay_allocations is
  'Explicit pay-period deduction previews/confirmations. Confirmation requires manager, worker authorization, and legal-policy evidence; no payroll movement is performed.';
comment on table public.employee_advance_events is
  'Append-only audit history for worker balance decisions, disputes, corrections, repayments, allocations, and reversals.';
