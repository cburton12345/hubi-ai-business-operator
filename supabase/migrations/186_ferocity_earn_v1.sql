-- Ferocity Earn V1 extends the canonical opportunity, invoice, payment, and billing systems.
-- It does not enroll existing tenants or assess historical payments.

insert into public.billing_plans (
  plan_key, name, monthly_price_cents, included_workspaces, included_brands, included_ai_runs, active, metadata_json
)
values (
  'earn', 'Ferocity Earn', 0, 1, 1, 200, true,
  '{"pricingModel":"earned_revenue","customerOriginatedBps":90,"ferocityOriginatedBps":600,"providerUsageSeparate":true,"monthlyCap":null,"jobCap":null}'::jsonb
)
on conflict (plan_key) do update set
  name=excluded.name,
  monthly_price_cents=0,
  active=true,
  metadata_json=public.billing_plans.metadata_json || excluded.metadata_json;

alter table public.service_jobs add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
alter table public.service_invoices add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
alter table public.service_invoice_payments
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists allocated_tax_cents integer not null default 0 check (allocated_tax_cents >= 0),
  add column if not exists tip_cents integer not null default 0 check (tip_cents >= 0),
  add column if not exists excluded_amount_cents integer not null default 0 check (excluded_amount_cents >= 0),
  add column if not exists refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0);

create index if not exists idx_service_jobs_opportunity on public.service_jobs(tenant_id, opportunity_id);
create index if not exists idx_service_invoices_opportunity on public.service_invoices(tenant_id, opportunity_id);
create index if not exists idx_service_invoice_payments_opportunity on public.service_invoice_payments(tenant_id, opportunity_id);
create unique index if not exists uniq_service_invoice_payments_idempotency
  on public.service_invoice_payments(tenant_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists uniq_service_ledger_provider_event
  on public.service_ledger_entries(tenant_id,provider_event_id,entry_type) where provider_event_id is not null;

create table if not exists public.earn_enrollments (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','terminated')),
  agreement_version text not null,
  effective_at timestamptz,
  terminated_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  settlement_day smallint not null default 1 check (settlement_day between 1 and 28),
  currency text not null default 'usd',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or (effective_at is not null and accepted_at is not null))
);

create table if not exists public.earn_attributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  job_id uuid references public.service_jobs(id) on delete set null,
  classification text not null check (classification in ('CUSTOMER_ORIGINATED_FEROCITY_MANAGED','FEROCITY_ORIGINATED','NON_EARN','NEEDS_REVIEW')),
  locked_rate_bps integer not null check (locked_rate_bps in (0,90,600)),
  attributed_at timestamptz not null default now(),
  attribution_reason text not null,
  source_channel text not null,
  campaign_id uuid,
  conversation_id uuid,
  call_id uuid,
  message_id uuid,
  referral_identifier text,
  reactivation_identifier text,
  established_by_type text not null check (established_by_type in ('user','automation','ai','import','system')),
  established_by_user_id uuid references public.users(id) on delete set null,
  evidence_json jsonb not null default '{}'::jsonb,
  agreement_version text not null,
  dispute_status text not null default 'none' check (dispute_status in ('none','open','under_review','resolved')),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, opportunity_id),
  check (
    (classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED' and locked_rate_bps=90)
    or (classification='FEROCITY_ORIGINATED' and locked_rate_bps=600)
    or (classification in ('NON_EARN','NEEDS_REVIEW') and locked_rate_bps=0)
  )
);

create table if not exists public.earn_attribution_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attribution_id uuid not null references public.earn_attributions(id) on delete restrict,
  event_type text not null check (event_type in ('established','corrected','disputed','resolved')),
  prior_classification text,
  prior_rate_bps integer,
  new_classification text not null,
  new_rate_bps integer not null,
  reason text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  actor_type text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_payment_exclusions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.service_invoice_payments(id) on delete restrict,
  category text not null check (category in ('tax','tip','government_fee','pass_through','duplicate','internal_transfer','error','approved_credit','other')),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied','reversed')),
  evidence_json jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid references public.users(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  attribution_id uuid references public.earn_attributions(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete restrict,
  job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  payment_id uuid references public.service_invoice_payments(id) on delete restrict,
  classification text not null,
  locked_rate_bps integer not null,
  eligible_amount_cents bigint not null default 0,
  earn_amount_cents bigint not null default 0,
  event_type text not null check (event_type in ('eligible_payment','earn_accrual','refund','chargeback','earn_credit','correction','exclusion','manual_adjustment','settlement','failed_settlement','reversal')),
  reason text not null,
  source_event_key text not null,
  linked_prior_entry_id uuid references public.earn_ledger_entries(id) on delete restrict,
  billing_period_start date not null,
  settlement_status text not null default 'unsettled' check (settlement_status in ('unsettled','disputed','scheduled','settled','failed','reversed')),
  dispute_id uuid,
  currency text not null default 'usd',
  actor_type text not null default 'system',
  actor_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, source_event_key)
);

create table if not exists public.earn_disputes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attribution_id uuid references public.earn_attributions(id) on delete restrict,
  ledger_entry_id uuid references public.earn_ledger_entries(id) on delete restrict,
  dispute_type text not null check (dispute_type in ('attribution','eligible_amount','payment_classification','earn_calculation','exclusion_adjustment')),
  reason text not null,
  explanation text not null,
  amount_cents bigint not null default 0,
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','UNDER_REVIEW','APPROVED','PARTIALLY_APPROVED','DENIED','RESOLVED')),
  resolution text,
  requested_by_user_id uuid references public.users(id) on delete set null,
  resolved_by_user_id uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.earn_ledger_entries
  add constraint earn_ledger_dispute_fk foreign key (dispute_id) references public.earn_disputes(id) on delete set null;

create table if not exists public.earn_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  eligible_managed_cents bigint not null default 0,
  managed_earn_cents bigint not null default 0,
  eligible_originated_cents bigint not null default 0,
  originated_earn_cents bigint not null default 0,
  adjustment_cents bigint not null default 0,
  provider_usage_cents bigint not null default 0,
  prior_balance_cents bigint not null default 0,
  total_due_cents bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','scheduled','processing','paid','failed','void')),
  provider_invoice_id text,
  idempotency_key text not null,
  scheduled_for date,
  settled_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end),
  unique (idempotency_key)
);

create index if not exists idx_earn_attributions_tenant on public.earn_attributions(tenant_id, classification, attributed_at desc);
create index if not exists idx_earn_history_attribution on public.earn_attribution_history(attribution_id, created_at desc);
create index if not exists idx_earn_ledger_tenant_period on public.earn_ledger_entries(tenant_id, billing_period_start, occurred_at desc);
create index if not exists idx_earn_ledger_payment on public.earn_ledger_entries(payment_id, event_type);
create index if not exists idx_earn_disputes_tenant on public.earn_disputes(tenant_id, status, created_at desc);

alter table public.earn_enrollments enable row level security;
alter table public.earn_attributions enable row level security;
alter table public.earn_attribution_history enable row level security;
alter table public.earn_payment_exclusions enable row level security;
alter table public.earn_ledger_entries enable row level security;
alter table public.earn_disputes enable row level security;
alter table public.earn_settlements enable row level security;

create policy earn_enrollments_members on public.earn_enrollments for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_enrollments_admin on public.earn_enrollments for all
  using (public.has_tenant_role(tenant_id,array['owner','admin']))
  with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy earn_attributions_members on public.earn_attributions for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_attributions_admin on public.earn_attributions for all
  using (public.has_tenant_role(tenant_id,array['owner','admin']))
  with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy earn_history_members on public.earn_attribution_history for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_history_admin on public.earn_attribution_history for insert
  with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy earn_exclusions_members on public.earn_payment_exclusions for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_exclusions_admin on public.earn_payment_exclusions for all
  using (public.has_tenant_role(tenant_id,array['owner','admin']))
  with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy earn_ledger_members on public.earn_ledger_entries for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_disputes_members on public.earn_disputes for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));
create policy earn_disputes_create on public.earn_disputes for insert
  with check (public.has_tenant_role(tenant_id,array['owner','admin']));
create policy earn_settlements_members on public.earn_settlements for select
  using (public.has_tenant_role(tenant_id,array['owner','admin','operator','viewer']));

-- Ledger rows are append-only. Reversals, credits, and corrections are new entries.
create or replace function public.prevent_earn_ledger_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op='DELETE' then
    raise exception 'Ferocity Earn ledger entries cannot be deleted; create a reversal entry instead.';
  end if;
  if new.tenant_id<>old.tenant_id or new.attribution_id is distinct from old.attribution_id
     or new.opportunity_id is distinct from old.opportunity_id or new.payment_id is distinct from old.payment_id
     or new.classification<>old.classification or new.locked_rate_bps<>old.locked_rate_bps
     or new.eligible_amount_cents<>old.eligible_amount_cents or new.earn_amount_cents<>old.earn_amount_cents
     or new.event_type<>old.event_type or new.source_event_key<>old.source_event_key
     or new.occurred_at<>old.occurred_at then
    raise exception 'Ferocity Earn monetary history is immutable; create an adjustment entry instead.';
  end if;
  return new;
end $$;
drop trigger if exists trg_prevent_earn_ledger_update on public.earn_ledger_entries;
create trigger trg_prevent_earn_ledger_update before update or delete on public.earn_ledger_entries
for each row execute function public.prevent_earn_ledger_mutation();

-- Return the canonical opportunity for a payment without using mutable customer provenance.
create or replace function public.resolve_earn_payment_opportunity(p_payment_id uuid) returns uuid
language sql stable set search_path=public as $$
  select coalesce(p.opportunity_id, i.opportunity_id, j.opportunity_id, o.id)
  from public.service_invoice_payments p
  join public.service_invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id
  left join public.service_jobs j on j.id=i.job_id and j.tenant_id=i.tenant_id
  left join public.opportunities o on o.tenant_id=i.tenant_id and o.estimate_id=i.estimate_id
  where p.id=p_payment_id
  order by o.created_at asc nulls last
  limit 1
$$;

-- Idempotently accrue Earn only when enrollment and evidence-backed attribution exist.
create or replace function public.accrue_earn_for_payment(p_payment_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_payment public.service_invoice_payments%rowtype;
  v_invoice public.service_invoices%rowtype;
  v_enrollment public.earn_enrollments%rowtype;
  v_attr public.earn_attributions%rowtype;
  v_opportunity uuid;
  v_tax integer := 0;
  v_approved_exclusions integer := 0;
  v_eligible bigint := 0;
  v_earn bigint := 0;
  v_entry uuid;
begin
  select * into v_payment from public.service_invoice_payments where id=p_payment_id;
  if not found or v_payment.status not in ('succeeded','manual') then return null; end if;
  select * into v_invoice from public.service_invoices where id=v_payment.invoice_id and tenant_id=v_payment.tenant_id;
  select * into v_enrollment from public.earn_enrollments where tenant_id=v_payment.tenant_id;
  if not found or v_enrollment.status not in ('active','terminated') or v_enrollment.effective_at is null
     or coalesce(v_payment.paid_at,v_payment.received_at,v_payment.created_at) < v_enrollment.effective_at then return null; end if;
  v_opportunity := public.resolve_earn_payment_opportunity(p_payment_id);
  if v_opportunity is null then return null; end if;
  select * into v_attr from public.earn_attributions where tenant_id=v_payment.tenant_id and opportunity_id=v_opportunity;
  if not found or v_attr.classification in ('NON_EARN','NEEDS_REVIEW') then return null; end if;
  if v_enrollment.status='terminated' and v_attr.attributed_at > v_enrollment.terminated_at then return null; end if;
  select coalesce(sum(amount_cents),0)::integer into v_approved_exclusions
    from public.earn_payment_exclusions where payment_id=p_payment_id and status='approved';
  v_tax := case when v_payment.allocated_tax_cents > 0 then v_payment.allocated_tax_cents
    when v_invoice.total_cents > 0 and v_invoice.tax_cents > 0
      then floor((v_payment.amount_cents::numeric * v_invoice.tax_cents::numeric + (v_invoice.total_cents / 2)) / v_invoice.total_cents)::integer
    else 0 end;
  v_eligible := greatest(v_payment.amount_cents - v_tax - v_payment.tip_cents - v_payment.excluded_amount_cents - v_approved_exclusions,0);
  v_earn := floor((v_eligible::numeric * v_attr.locked_rate_bps::numeric + 5000) / 10000)::bigint;
  insert into public.earn_ledger_entries (
    tenant_id,attribution_id,opportunity_id,job_id,customer_id,payment_id,classification,locked_rate_bps,
    eligible_amount_cents,earn_amount_cents,event_type,reason,source_event_key,billing_period_start,currency,actor_type,metadata_json,occurred_at
  ) values (
    v_payment.tenant_id,v_attr.id,v_opportunity,coalesce(v_attr.job_id,v_invoice.job_id),v_payment.customer_id,v_payment.id,
    v_attr.classification,v_attr.locked_rate_bps,v_eligible,0,'eligible_payment','Eligible collected revenue recorded.',
    'payment:'||v_payment.id::text||':eligible',date_trunc('month',coalesce(v_payment.paid_at,v_payment.received_at))::date,
    v_payment.currency,'system',jsonb_build_object('taxExcludedCents',v_tax,'approvedExclusionsCents',v_approved_exclusions),coalesce(v_payment.paid_at,v_payment.received_at)
  ) on conflict (tenant_id,source_event_key) do nothing returning id into v_entry;
  insert into public.earn_ledger_entries (
    tenant_id,attribution_id,opportunity_id,job_id,customer_id,payment_id,classification,locked_rate_bps,
    eligible_amount_cents,earn_amount_cents,event_type,reason,source_event_key,billing_period_start,currency,actor_type,metadata_json,occurred_at,linked_prior_entry_id
  ) values (
    v_payment.tenant_id,v_attr.id,v_opportunity,coalesce(v_attr.job_id,v_invoice.job_id),v_payment.customer_id,v_payment.id,
    v_attr.classification,v_attr.locked_rate_bps,0,v_earn,'earn_accrual','Ferocity Earn accrued when the business received eligible revenue.',
    'payment:'||v_payment.id::text||':earn',date_trunc('month',coalesce(v_payment.paid_at,v_payment.received_at))::date,
    v_payment.currency,'system',jsonb_build_object('eligibleAmountCents',v_eligible),coalesce(v_payment.paid_at,v_payment.received_at),v_entry
  ) on conflict (tenant_id,source_event_key) do nothing returning id into v_entry;
  return v_entry;
end $$;

create or replace function public.trigger_accrue_earn_for_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.accrue_earn_for_payment(new.id); return new; end $$;
drop trigger if exists trg_accrue_earn_payment on public.service_invoice_payments;
create trigger trg_accrue_earn_payment after insert or update of status on public.service_invoice_payments
for each row when (new.status in ('succeeded','manual')) execute function public.trigger_accrue_earn_for_payment();

create or replace function public.adjust_earn_for_refund(
  p_payment_id uuid,
  p_refund_cents integer,
  p_source_event_key text,
  p_event_type text default 'refund'
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_payment public.service_invoice_payments%rowtype;
  v_accrual public.earn_ledger_entries%rowtype;
  v_eligible_refund bigint;
  v_earn_credit bigint;
  v_already_eligible bigint;
  v_entry uuid;
begin
  if p_refund_cents<=0 or p_event_type not in ('refund','chargeback') then return null; end if;
  select * into v_payment from public.service_invoice_payments where id=p_payment_id;
  select * into v_accrual from public.earn_ledger_entries
    where tenant_id=v_payment.tenant_id and payment_id=p_payment_id and event_type='eligible_payment' limit 1;
  if not found or v_payment.amount_cents<=0 then return null; end if;
  select coalesce(-sum(eligible_amount_cents),0)::bigint into v_already_eligible
    from public.earn_ledger_entries where tenant_id=v_payment.tenant_id and payment_id=p_payment_id
      and event_type in ('refund','chargeback','exclusion','reversal') and eligible_amount_cents<0;
  v_eligible_refund := least(
    greatest(v_accrual.eligible_amount_cents-v_already_eligible,0),
    floor((v_accrual.eligible_amount_cents::numeric*p_refund_cents::numeric+(v_payment.amount_cents/2))/v_payment.amount_cents)::bigint
  );
  v_earn_credit := floor((v_eligible_refund::numeric*v_accrual.locked_rate_bps+5000)/10000)::bigint;
  insert into public.earn_ledger_entries (
    tenant_id,attribution_id,opportunity_id,job_id,customer_id,payment_id,classification,locked_rate_bps,
    eligible_amount_cents,earn_amount_cents,event_type,reason,source_event_key,linked_prior_entry_id,
    billing_period_start,settlement_status,currency,actor_type,metadata_json
  ) values (
    v_payment.tenant_id,v_accrual.attribution_id,v_accrual.opportunity_id,v_accrual.job_id,v_accrual.customer_id,p_payment_id,
    v_accrual.classification,v_accrual.locked_rate_bps,-v_eligible_refund,0,p_event_type,
    case when p_event_type='chargeback' then 'Eligible revenue reversed by chargeback.' else 'Eligible revenue reduced by refund.' end,
    p_source_event_key||':eligible',v_accrual.id,date_trunc('month',current_date)::date,'unsettled',v_payment.currency,'system',
    jsonb_build_object('refundAmountCents',p_refund_cents)
  ) on conflict (tenant_id,source_event_key) do nothing returning id into v_entry;
  insert into public.earn_ledger_entries (
    tenant_id,attribution_id,opportunity_id,job_id,customer_id,payment_id,classification,locked_rate_bps,
    eligible_amount_cents,earn_amount_cents,event_type,reason,source_event_key,linked_prior_entry_id,
    billing_period_start,settlement_status,currency,actor_type,metadata_json
  ) values (
    v_payment.tenant_id,v_accrual.attribution_id,v_accrual.opportunity_id,v_accrual.job_id,v_accrual.customer_id,p_payment_id,
    v_accrual.classification,v_accrual.locked_rate_bps,0,-v_earn_credit,'earn_credit','Earn credit created from reversed eligible revenue.',
    p_source_event_key||':earn-credit',coalesce(v_entry,v_accrual.id),date_trunc('month',current_date)::date,'unsettled',v_payment.currency,'system',
    jsonb_build_object('eligibleRefundCents',v_eligible_refund)
  ) on conflict (tenant_id,source_event_key) do nothing returning id into v_entry;
  return v_entry;
end $$;

-- These accounting functions bypass RLS so payment triggers and trusted server jobs can
-- append immutable ledger entries. Never expose them as tenant-callable RPC endpoints.
revoke all on function public.accrue_earn_for_payment(uuid) from public, anon, authenticated;
revoke all on function public.trigger_accrue_earn_for_payment() from public, anon, authenticated;
revoke all on function public.adjust_earn_for_refund(uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.accrue_earn_for_payment(uuid) to service_role;
grant execute on function public.trigger_accrue_earn_for_payment() to service_role;
grant execute on function public.adjust_earn_for_refund(uuid,integer,text,text) to service_role;

-- Never backfill old opportunities or payments here. Enrollment and attribution are explicit product actions.
