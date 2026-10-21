-- Canonical idempotency and provider identity for customer invoice refunds and disputes.
-- Existing refund rows remain valid; new writers must supply idempotency_key.

alter table public.payment_refunds
  add column if not exists idempotency_key text;

update public.payment_refunds
set idempotency_key='legacy-refund:'||id::text
where idempotency_key is null;

-- Earlier manual/Stripe paths tracked the cumulative amount on the payment but
-- did not always create the canonical refund row. Preserve that history as one
-- deterministic reconciliation row rather than losing or counting it twice.
with recorded as (
  select payment_id,coalesce(sum(amount_cents) filter (where status='succeeded'),0)::integer amount_cents
  from public.payment_refunds
  group by payment_id
)
insert into public.payment_refunds (
  tenant_id,payment_id,amount_cents,status,reason,provider_refund_id,idempotency_key,processed_at,metadata_json
)
select p.tenant_id,p.id,p.refunded_amount_cents-coalesce(r.amount_cents,0),'succeeded',
  'Historical refund reconciled into the canonical refund ledger.',
  'legacy-payment-refund:'||p.id::text,'legacy-payment-refund:'||p.id::text,now(),
  jsonb_build_object('source','migration_257','historicalReconciliation',true)
from public.service_invoice_payments p
left join recorded r on r.payment_id=p.id
where p.refunded_amount_cents>coalesce(r.amount_cents,0);

-- POS returns previously created refund rows without updating the cumulative
-- payment field. Bring both representations into agreement, bounded by the
-- actual payment amount.
with totals as (
  select payment_id,coalesce(sum(amount_cents) filter (where status='succeeded'),0)::integer amount_cents
  from public.payment_refunds
  group by payment_id
)
update public.service_invoice_payments p
set refunded_amount_cents=least(p.amount_cents,t.amount_cents),
    status=case
      when t.amount_cents>=p.amount_cents then 'refunded'
      when t.amount_cents>0 then 'partially_refunded'
      else p.status
    end
from totals t
where p.id=t.payment_id and p.refunded_amount_cents<>least(p.amount_cents,t.amount_cents);

-- Reopen only invoices that have canonical payment/refund history. Imported
-- invoice balances without payment rows remain untouched.
with affected as (
  select distinct p.tenant_id,p.invoice_id
  from public.service_invoice_payments p
  join public.payment_refunds r on r.tenant_id=p.tenant_id and r.payment_id=p.id and r.status='succeeded'
), net_payment as (
  select p.tenant_id,p.invoice_id,
    coalesce(sum(greatest(p.amount_cents-p.refunded_amount_cents,0))
      filter (where p.status in ('succeeded','manual','partially_refunded','refunded')),0)::integer amount_cents
  from public.service_invoice_payments p
  join affected a on a.tenant_id=p.tenant_id and a.invoice_id=p.invoice_id
  group by p.tenant_id,p.invoice_id
)
update public.service_invoices i
set amount_paid_cents=least(i.total_cents,n.amount_cents),
    status=case
      when i.total_cents=0 then 'void'
      when n.amount_cents>=i.total_cents then 'paid'
      when n.amount_cents>0 then 'partially_paid'
      when i.due_date is not null and i.due_date<current_date then 'overdue'
      else 'sent_manually'
    end,
    updated_at=now()
from net_payment n
where i.tenant_id=n.tenant_id and i.id=n.invoice_id
  and i.amount_paid_cents<>least(i.total_cents,n.amount_cents);

update public.service_invoices
set write_off_cents=greatest(least(write_off_cents,total_cents-amount_paid_cents),0),updated_at=now()
where write_off_cents>greatest(total_cents-amount_paid_cents,0);

create unique index if not exists payment_refunds_idempotency_unique
  on public.payment_refunds (tenant_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists payment_refunds_provider_identity_unique
  on public.payment_refunds (tenant_id, provider_refund_id)
  where provider_refund_id is not null;

create unique index if not exists payment_disputes_provider_identity_unique
  on public.payment_disputes (tenant_id, provider_dispute_id)
  where provider_dispute_id is not null;

create index if not exists payment_refunds_payment_status_idx
  on public.payment_refunds (tenant_id, payment_id, status, created_at desc);

alter table public.service_invoices drop constraint if exists service_invoices_status_check;
alter table public.service_invoices add constraint service_invoices_status_check
  check (status in ('draft','sent_manually','partially_paid','paid','void','overdue','written_off'));
