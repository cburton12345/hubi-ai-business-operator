import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { stripeFormRequest } from "@/lib/payments/stripe-connect";

type SettlementRow = {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_due_cents: string;
  idempotency_key: string;
  external_customer_ref: string | null;
};

export type EarnSettlementSyncResult = {
  status: "disabled" | "not_ready" | "not_due" | "processing" | "failed";
  settlementId?: string;
  providerInvoiceId?: string;
  amountCents?: number;
  reason?: string;
};

export async function syncEarnSettlementToStripe(
  settlementId: string,
  options: { forceCertification?: boolean } = {}
): Promise<EarnSettlementSyncResult> {
  if (env.FEROCITY_EARN_SETTLEMENT_ENABLED !== "true") return { status: "disabled" };
  if (!env.STRIPE_SECRET_KEY) return { status: "not_ready", reason: "Stripe billing is not configured." };

  const claimed = await queryPostgres<SettlementRow>(
    `with candidate as (
       select s.id,s.tenant_id,s.period_start::text,s.period_end::text,s.total_due_cents::text,s.idempotency_key,
         b.external_customer_ref
       from public.earn_settlements s
       join public.billing_subscriptions b on b.tenant_id=s.tenant_id and b.plan_key='earn'
       where s.id=$1
         and s.total_due_cents>0
         and s.provider_invoice_id is null
         and (s.status in ('scheduled','failed') or (s.status='processing' and s.updated_at<now()-interval '15 minutes'))
         and ($2::boolean or s.scheduled_for<=current_date)
       for update of s skip locked
     ), claimed as (
       update public.earn_settlements s set status='processing',
         metadata_json=s.metadata_json || jsonb_build_object('stripeAttemptedAt',now(),'stripeAttemptCount',coalesce((s.metadata_json->>'stripeAttemptCount')::integer,0)+1),
         updated_at=now()
       from candidate c where s.id=c.id returning c.*
     ) select * from claimed`,
    [settlementId, options.forceCertification === true]
  );
  const row = claimed?.rows[0];
  if (!row) return { status: "not_due", settlementId };
  const amountCents = Number(row.total_due_cents);
  if (!row.external_customer_ref || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    await queryPostgres(
      `update public.earn_settlements set status='failed',metadata_json=metadata_json || jsonb_build_object('safeError',$2::text),updated_at=now() where id=$1`,
      [row.id, "A Stripe billing customer or valid settlement amount is missing."]
    );
    return { status: "not_ready", settlementId: row.id, reason: "A Stripe billing customer or valid settlement amount is missing." };
  }

  try {
    await stripeFormRequest<{ id: string }>("invoiceitems", new URLSearchParams({
      customer: row.external_customer_ref,
      amount: String(amountCents),
      currency: "usd",
      description: `Ferocity Earn ${row.period_start} through ${row.period_end}`,
      "metadata[ferocity_kind]": "earn_settlement",
      "metadata[tenant_id]": row.tenant_id,
      "metadata[settlement_id]": row.id,
      "metadata[period_start]": row.period_start,
      "metadata[period_end]": row.period_end
    }), { idempotencyKey: `${row.idempotency_key}:item` });
    const invoice = await stripeFormRequest<{ id: string; status?: string }>("invoices", new URLSearchParams({
      customer: row.external_customer_ref,
      collection_method: "charge_automatically",
      auto_advance: "true",
      description: `Ferocity Earn settlement for ${row.period_start} through ${row.period_end}`,
      "metadata[ferocity_kind]": "earn_settlement",
      "metadata[tenant_id]": row.tenant_id,
      "metadata[settlement_id]": row.id,
      "metadata[period_start]": row.period_start,
      "metadata[period_end]": row.period_end
    }), { idempotencyKey: `${row.idempotency_key}:invoice` });
    if (!invoice.id) throw new Error("Stripe did not return an invoice id.");
    await queryPostgres(
      `update public.earn_settlements set provider_invoice_id=$2,
         metadata_json=metadata_json || jsonb_build_object('stripeInvoiceStatus',$3::text),updated_at=now()
       where id=$1 and status='processing'`,
      [row.id, invoice.id, invoice.status ?? "created"]
    );
    return { status: "processing", settlementId: row.id, providerInvoiceId: invoice.id, amountCents };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe Earn settlement failed.";
    await queryPostgres(
      `with failed as (
         update public.earn_settlements set status='failed',metadata_json=metadata_json || jsonb_build_object('safeError',$2::text),updated_at=now()
         where id=$1 returning tenant_id,period_start
       ) update public.earn_ledger_entries l set settlement_status='failed'
         from failed f where l.tenant_id=f.tenant_id and l.billing_period_start=f.period_start and l.settlement_status='scheduled'`,
      [row.id, message.slice(0, 500)]
    );
    await logAppError({
      source: "billing.earn.settlement",
      message: "Ferocity Earn settlement could not be submitted to Stripe.",
      severity: "warning",
      tenantId: row.tenant_id,
      retryable: true,
      metadata: { settlementId: row.id, error: message.slice(0, 500) }
    });
    return { status: "failed", settlementId: row.id, amountCents, reason: message.slice(0, 500) };
  }
}

export async function syncDueEarnSettlementForTenant(tenantId: string): Promise<EarnSettlementSyncResult> {
  if (env.FEROCITY_EARN_SETTLEMENT_ENABLED !== "true") return { status: "disabled" };
  const due = await queryPostgres<{ id: string }>(
    `select id from public.earn_settlements
      where tenant_id=$1 and total_due_cents>0 and provider_invoice_id is null
        and (status in ('scheduled','failed') or (status='processing' and updated_at<now()-interval '15 minutes'))
        and scheduled_for<=current_date
      order by period_start limit 1`,
    [tenantId]
  );
  const settlementId = due?.rows[0]?.id;
  return settlementId ? syncEarnSettlementToStripe(settlementId) : { status: "not_due" };
}

export async function recordEarnSettlementStripeEvent(input: {
  eventId: string;
  eventType: "invoice.paid" | "invoice.payment_failed" | "invoice.voided";
  invoiceId: string;
  tenantId: string;
  settlementId: string;
  amountPaidCents?: number;
}) {
  const outcome = input.eventType === "invoice.paid" ? "paid" : input.eventType === "invoice.voided" ? "void" : "failed";
  const ledgerOutcome = outcome === "paid" ? "settled" : outcome === "void" ? "unsettled" : "failed";
  await queryPostgres(
    `with updated as (
       update public.earn_settlements set status=$4,provider_invoice_id=coalesce(provider_invoice_id,$3),
         settled_at=case when $4='paid' then now() else settled_at end,
         metadata_json=metadata_json || jsonb_build_object('stripeEventId',$5::text,'stripeEventType',$6::text,'amountPaidCents',$7::integer),updated_at=now()
       where id=$1 and tenant_id=$2 and (provider_invoice_id is null or provider_invoice_id=$3)
         and status in ('processing','scheduled','failed')
       returning tenant_id,period_start,id
     ) update public.earn_ledger_entries l set settlement_status=$8,
       metadata_json=l.metadata_json || jsonb_build_object('settlementId',u.id,'stripeInvoiceId',$3::text,'stripeEventId',$5::text)
       from updated u where l.tenant_id=u.tenant_id and l.billing_period_start=u.period_start
         and l.settlement_status in ('scheduled','failed')`,
    [input.settlementId, input.tenantId, input.invoiceId, outcome, input.eventId, input.eventType, input.amountPaidCents ?? 0, ledgerOutcome]
  );
}
