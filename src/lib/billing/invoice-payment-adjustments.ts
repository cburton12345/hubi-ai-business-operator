import type pg from "pg";
import { withPostgresTransactionResult } from "@/lib/db/postgres";

export type InvoiceRefundResult =
  | {
      status: "recorded" | "already_recorded";
      paymentId: string;
      invoiceId: string;
      refundId: string | null;
      refundDeltaCents: number;
      cumulativeRefundCents: number;
    }
  | { status: "payment_not_found"; refundDeltaCents: 0 };

export type InvoiceRefundInput = {
  tenantId: string;
  paymentId?: string;
  invoiceId?: string;
  provider?: "stripe" | "manual" | "external";
  providerPaymentId?: string;
  amountCents: number;
  amountMode: "incremental" | "cumulative";
  idempotencyKey: string;
  reason: string;
  source: string;
  requestedByUserId?: string | null;
  providerRefundId?: string | null;
  reduceInvoiceTotal?: boolean;
  invoiceCreditCents?: number;
  metadata?: Record<string, unknown>;
};

export type InvoiceRefundAllocationResult = {
  status: "recorded" | "already_recorded" | "invoice_not_found" | "insufficient_refundable_balance";
  invoiceId: string;
  requestedRefundCents: number;
  refundDeltaCents: number;
  cumulativeAllocationCents: number;
  remainingRefundableCents: number;
  refundIds: string[];
};

export type InvoiceWriteOffResult =
  | { status: "recorded"; invoiceId: string; writeOffDeltaCents: number; balanceDueCents: number }
  | { status: "already_recorded" | "invoice_not_found" | "no_balance"; invoiceId: string; writeOffDeltaCents: 0; balanceDueCents: number };

type LockedPayment = {
  id: string;
  invoice_id: string;
  customer_id: string;
  brand_id: string | null;
  provider: string;
  amount_cents: number;
  refunded_amount_cents: number;
  currency: string;
};

function validateRefundInput(input: InvoiceRefundInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Refund amount must be a positive whole number of cents.");
  }
  if (!input.paymentId && !(input.invoiceId && input.provider && input.providerPaymentId)) {
    throw new Error("A payment ID or an exact provider payment binding is required.");
  }
  if (!input.idempotencyKey.trim()) throw new Error("A refund idempotency key is required.");
  if (!input.reason.trim()) throw new Error("A refund reason is required.");
  if (input.invoiceCreditCents !== undefined && (!Number.isSafeInteger(input.invoiceCreditCents) || input.invoiceCreditCents < 0)) {
    throw new Error("Invoice credit must be a nonnegative whole number of cents.");
  }
}

export async function recordInvoiceRefundWithClient(
  client: pg.PoolClient,
  input: InvoiceRefundInput
): Promise<InvoiceRefundResult> {
  validateRefundInput(input);
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [
    `invoice-refund:${input.tenantId}:${input.paymentId ?? `${input.provider}:${input.providerPaymentId}`}`
  ]);

  const paymentResult = await client.query<LockedPayment>(
    `select id,invoice_id,customer_id,brand_id,provider,amount_cents,refunded_amount_cents,currency
     from public.service_invoice_payments
     where tenant_id=$1
       and (($2::uuid is not null and id=$2::uuid)
         or ($2::uuid is null and invoice_id=$3::uuid and provider=$4 and provider_payment_id=$5))
     limit 1
     for update`,
    [input.tenantId, input.paymentId ?? null, input.invoiceId ?? null, input.provider ?? null, input.providerPaymentId ?? null]
  );
  const payment = paymentResult.rows[0];
  if (!payment) return { status: "payment_not_found", refundDeltaCents: 0 };

  const existing = await client.query<{ id: string; amount_cents: number }>(
    `select id,amount_cents from public.payment_refunds
     where tenant_id=$1 and idempotency_key=$2
     limit 1`,
    [input.tenantId, input.idempotencyKey]
  );
  if (existing.rows[0]) {
    return {
      status: "already_recorded",
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      refundId: existing.rows[0].id,
      refundDeltaCents: 0,
      cumulativeRefundCents: payment.refunded_amount_cents
    };
  }

  const remainingRefundable = Math.max(payment.amount_cents - payment.refunded_amount_cents, 0);
  const requestedDelta = input.amountMode === "cumulative"
    ? Math.max(input.amountCents - payment.refunded_amount_cents, 0)
    : input.amountCents;
  const refundDeltaCents = Math.min(requestedDelta, remainingRefundable);
  if (refundDeltaCents <= 0) {
    return {
      status: "already_recorded",
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      refundId: null,
      refundDeltaCents: 0,
      cumulativeRefundCents: payment.refunded_amount_cents
    };
  }

  const refund = await client.query<{ id: string }>(
    `insert into public.payment_refunds (
       tenant_id,payment_id,amount_cents,status,reason,provider_refund_id,idempotency_key,
       requested_by_user_id,processed_at,metadata_json
     ) values ($1,$2,$3,'succeeded',$4,$5,$6,$7,now(),$8::jsonb)
     on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [
      input.tenantId,
      payment.id,
      refundDeltaCents,
      input.reason,
      input.providerRefundId ?? null,
      input.idempotencyKey,
      input.requestedByUserId ?? null,
      JSON.stringify({ source: input.source, ...(input.metadata ?? {}) })
    ]
  );
  const refundId = refund.rows[0]?.id;
  if (!refundId) {
    const concurrent = await client.query<{ id: string }>(
      `select id from public.payment_refunds where tenant_id=$1 and idempotency_key=$2 limit 1`,
      [input.tenantId, input.idempotencyKey]
    );
    return {
      status: "already_recorded",
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      refundId: concurrent.rows[0]?.id ?? null,
      refundDeltaCents: 0,
      cumulativeRefundCents: payment.refunded_amount_cents
    };
  }

  const cumulativeRefundCents = payment.refunded_amount_cents + refundDeltaCents;
  await client.query(
    `update public.service_invoice_payments
     set refunded_amount_cents=$3,
         status=case when $3>=amount_cents then 'refunded' else 'partially_refunded' end,
         metadata_json=metadata_json || jsonb_build_object(
           'lastRefundId',$4::text,'lastRefundKey',$5::text,'lastRefundSource',$6::text
         )
     where tenant_id=$1 and id=$2`,
    [input.tenantId, payment.id, cumulativeRefundCents, refundId, input.idempotencyKey, input.source]
  );

  const invoiceCreditCents = input.invoiceCreditCents ?? 0;
  await client.query(
    `update public.service_invoices
     set total_cents=case when $4 then greatest(total_cents-$3,0) else total_cents end,
         amount_paid_cents=greatest(amount_paid_cents-$3,0),
         credit_cents=credit_cents+$5,
         status=case
           when $4 and greatest(total_cents-$3,0)=0 then 'void'
           when greatest(amount_paid_cents-$3,0)+write_off_cents>=case when $4 then greatest(total_cents-$3,0) else total_cents end
             then case when write_off_cents>0 then 'written_off' else 'paid' end
           when greatest(amount_paid_cents-$3,0)>0 then 'partially_paid'
           when due_date is not null and due_date<current_date then 'overdue'
           else 'sent_manually'
         end,
         internal_notes=concat_ws(E'\n',nullif(internal_notes,''),$6),
         updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, payment.invoice_id, refundDeltaCents, input.reduceInvoiceTotal === true, invoiceCreditCents, `Refund ${refundId}: ${input.reason}`]
  );

  await client.query(
    `insert into public.service_ledger_entries (
       tenant_id,brand_id,customer_id,invoice_id,payment_id,entry_type,direction,
       amount_cents,currency,description,provider,provider_event_id,metadata_json
     ) values ($1,$2,$3,$4,$5,'refund','debit',$6,$7,$8,$9,$10,$11::jsonb)
     on conflict (tenant_id,provider_event_id,entry_type) where provider_event_id is not null do nothing`,
    [
      input.tenantId,
      payment.brand_id,
      payment.customer_id,
      payment.invoice_id,
      payment.id,
      refundDeltaCents,
      payment.currency,
      input.reason,
      payment.provider,
      input.idempotencyKey,
      JSON.stringify({ refundId, source: input.source, ...(input.metadata ?? {}) })
    ]
  );

  await client.query(`select public.adjust_earn_for_refund($1,$2,$3,'refund')`, [
    payment.id,
    refundDeltaCents,
    input.idempotencyKey
  ]);

  return {
    status: "recorded",
    paymentId: payment.id,
    invoiceId: payment.invoice_id,
    refundId,
    refundDeltaCents,
    cumulativeRefundCents
  };
}

export async function recordInvoiceRefund(input: InvoiceRefundInput): Promise<InvoiceRefundResult> {
  const transaction = await withPostgresTransactionResult((client) => recordInvoiceRefundWithClient(client, input));
  if (!transaction.ok) throw new Error("Ferocity could not reconcile the refund safely.", { cause: transaction.error });
  return transaction.value;
}

export async function recordInvoiceRefundAcrossPaymentsWithClient(
  client: pg.PoolClient,
  input: Omit<InvoiceRefundInput, "paymentId" | "provider" | "providerPaymentId" | "amountMode"> & { invoiceId: string }
): Promise<InvoiceRefundAllocationResult> {
  validateRefundInput({ ...input, paymentId: undefined, provider: "manual", providerPaymentId: "invoice-allocation", amountMode: "incremental" });
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [
    `invoice-refund-allocation:${input.tenantId}:${input.invoiceId}`
  ]);

  const invoice = await client.query<{ id: string }>(
    `select id from public.service_invoices where tenant_id=$1 and id=$2 limit 1 for update`,
    [input.tenantId, input.invoiceId]
  );
  if (!invoice.rows[0]) {
    return {
      status: "invoice_not_found",
      invoiceId: input.invoiceId,
      requestedRefundCents: input.amountCents,
      refundDeltaCents: 0,
      cumulativeAllocationCents: 0,
      remainingRefundableCents: 0,
      refundIds: []
    };
  }

  const existing = await client.query<{ amount_cents: number; id: string }>(
    `select amount_cents,id from public.payment_refunds
     where tenant_id=$1 and status='succeeded'
       and metadata_json->>'allocationKey'=$2
     order by created_at,id`,
    [input.tenantId, input.idempotencyKey]
  );
  const existingCents = existing.rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const stillRequestedCents = Math.max(input.amountCents - existingCents, 0);

  const payments = await client.query<LockedPayment>(
    `select id,invoice_id,customer_id,brand_id,provider,amount_cents,refunded_amount_cents,currency
     from public.service_invoice_payments
     where tenant_id=$1 and invoice_id=$2
       and status in ('succeeded','manual','partially_refunded')
       and refunded_amount_cents<amount_cents
     order by paid_at nulls last,received_at,id
     for update`,
    [input.tenantId, input.invoiceId]
  );
  const availableCents = payments.rows.reduce(
    (sum, payment) => sum + Math.max(Number(payment.amount_cents) - Number(payment.refunded_amount_cents), 0),
    0
  );
  if (stillRequestedCents > availableCents) {
    return {
      status: "insufficient_refundable_balance",
      invoiceId: input.invoiceId,
      requestedRefundCents: input.amountCents,
      refundDeltaCents: 0,
      cumulativeAllocationCents: existingCents,
      remainingRefundableCents: availableCents,
      refundIds: existing.rows.map((row) => row.id)
    };
  }
  if (stillRequestedCents === 0) {
    return {
      status: "already_recorded",
      invoiceId: input.invoiceId,
      requestedRefundCents: input.amountCents,
      refundDeltaCents: 0,
      cumulativeAllocationCents: existingCents,
      remainingRefundableCents: availableCents,
      refundIds: existing.rows.map((row) => row.id)
    };
  }

  let remainingCents = stillRequestedCents;
  let recordedCents = 0;
  const refundIds = existing.rows.map((row) => row.id);
  for (const payment of payments.rows) {
    if (remainingCents <= 0) break;
    const paymentAvailableCents = Math.max(Number(payment.amount_cents) - Number(payment.refunded_amount_cents), 0);
    if (paymentAvailableCents <= 0) continue;
    const amountCents = Math.min(remainingCents, paymentAvailableCents);
    const result = await recordInvoiceRefundWithClient(client, {
      ...input,
      paymentId: payment.id,
      invoiceId: input.invoiceId,
      amountCents,
      amountMode: "incremental",
      idempotencyKey: `${input.idempotencyKey}:${payment.id}`,
      invoiceCreditCents: input.invoiceCreditCents === undefined
        ? undefined
        : Math.min(amountCents, Math.max(input.invoiceCreditCents - recordedCents, 0)),
      metadata: { ...(input.metadata ?? {}), allocationKey: input.idempotencyKey }
    });
    if (result.status !== "recorded") continue;
    recordedCents += result.refundDeltaCents;
    remainingCents -= result.refundDeltaCents;
    if (result.refundId) refundIds.push(result.refundId);
  }
  if (remainingCents !== 0) throw new Error("The invoice refund allocation changed while it was being recorded.");

  return {
    status: "recorded",
    invoiceId: input.invoiceId,
    requestedRefundCents: input.amountCents,
    refundDeltaCents: recordedCents,
    cumulativeAllocationCents: existingCents + recordedCents,
    remainingRefundableCents: availableCents - recordedCents,
    refundIds
  };
}

export async function recordInvoiceWriteOff(input: {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
  reason: string;
  requestedByUserId?: string | null;
}): Promise<InvoiceWriteOffResult> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Write-off amount must be a positive whole number of cents.");
  if (!input.idempotencyKey.trim()) throw new Error("A write-off idempotency key is required.");
  if (input.reason.trim().length < 5) throw new Error("A write-off reason is required.");

  const transaction = await withPostgresTransactionResult<InvoiceWriteOffResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `invoice-write-off:${input.tenantId}:${input.invoiceId}`
    ]);
    const invoiceResult = await client.query<{
      id: string;
      brand_id: string | null;
      customer_id: string;
      total_cents: number;
      amount_paid_cents: number;
      write_off_cents: number;
      currency: string;
    }>(
      `select id,brand_id,customer_id,total_cents,amount_paid_cents,write_off_cents,'usd'::text currency
       from public.service_invoices where tenant_id=$1 and id=$2 limit 1 for update`,
      [input.tenantId, input.invoiceId]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return { status: "invoice_not_found", invoiceId: input.invoiceId, writeOffDeltaCents: 0, balanceDueCents: 0 };

    const balanceDueCents = Math.max(invoice.total_cents - invoice.amount_paid_cents - invoice.write_off_cents, 0);
    const existing = await client.query<{ id: string }>(
      `select id from public.service_ledger_entries
       where tenant_id=$1 and provider_event_id=$2 and entry_type='write_off' limit 1`,
      [input.tenantId, input.idempotencyKey]
    );
    if (existing.rows[0]) {
      return { status: "already_recorded", invoiceId: invoice.id, writeOffDeltaCents: 0, balanceDueCents };
    }
    if (balanceDueCents <= 0) return { status: "no_balance", invoiceId: invoice.id, writeOffDeltaCents: 0, balanceDueCents: 0 };

    const writeOffDeltaCents = Math.min(input.amountCents, balanceDueCents);
    const remainingBalanceCents = balanceDueCents - writeOffDeltaCents;
    await client.query(
      `insert into public.service_ledger_entries (
         tenant_id,brand_id,customer_id,invoice_id,entry_type,direction,amount_cents,currency,
         description,provider,provider_event_id,metadata_json
       ) values ($1,$2,$3,$4,'write_off','credit',$5,$6,$7,'manual',$8,$9::jsonb)
       on conflict (tenant_id,provider_event_id,entry_type) where provider_event_id is not null do nothing`,
      [
        input.tenantId,
        invoice.brand_id,
        invoice.customer_id,
        invoice.id,
        writeOffDeltaCents,
        invoice.currency,
        input.reason,
        input.idempotencyKey,
        JSON.stringify({ source: "invoice_write_off", requestedByUserId: input.requestedByUserId ?? null })
      ]
    );
    await client.query(
      `update public.service_invoices
       set write_off_cents=write_off_cents+$3,
           status=case when $4=0 then 'written_off' when amount_paid_cents>0 then 'partially_paid' else status end,
           internal_notes=concat_ws(E'\n',nullif(internal_notes,''),$5),updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, invoice.id, writeOffDeltaCents, remainingBalanceCents, `Write-off: ${input.reason}`]
    );
    await client.query(
      `with stopped as (
         update public.follow_up_workflows
         set status='canceled',completed_at=now(),
             metadata_json=metadata_json || jsonb_build_object('stoppedBy','invoice_write_off','writeOffKey',$3::text),updated_at=now()
         where tenant_id=$1 and invoice_id=$2 and workflow_type='invoice_followup'
           and status in ('open','scheduled')
         returning id
       )
       update public.outbound_action_queue q
       set status='canceled',last_error='Collection communication stopped because the invoice balance was written off.',updated_at=now()
       where q.tenant_id=$1 and q.target_type='follow_up_workflow'
         and q.target_id in (select id from stopped)
         and q.status in ('draft','needs_review','approved','queued')`,
      [input.tenantId, invoice.id, input.idempotencyKey]
    );
    return { status: "recorded", invoiceId: invoice.id, writeOffDeltaCents, balanceDueCents: remainingBalanceCents };
  });
  if (!transaction.ok) throw new Error("Ferocity could not record the invoice write-off safely.", { cause: transaction.error });
  return transaction.value;
}
