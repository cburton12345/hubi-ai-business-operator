import { withPostgresTransactionResult } from "@/lib/db/postgres";
import { synchronizeServiceKernelForJob } from "@/lib/service-ops/service-kernel";

export type ServiceJobStatus = "unscheduled" | "scheduled" | "in_progress" | "completed" | "canceled" | "lost";
export type OperatorInvoiceStatus = "draft" | "sent_manually" | "void" | "overdue";

export type ServiceJobUpdateResult = {
  status: "updated" | "not_found";
  jobId: string;
  customerId: string | null;
  previousStatus: ServiceJobStatus | null;
  currentStatus: ServiceJobStatus | null;
};

export async function updateServiceJob(input: {
  tenantId: string;
  jobId: string;
  status: ServiceJobStatus;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  dispatcherNotes: string | null;
  completionNotes: string | null;
  nextAction: string | null;
  eventSource: "user" | "worker";
  preserveSchedule?: boolean;
}): Promise<ServiceJobUpdateResult> {
  const transaction = await withPostgresTransactionResult<ServiceJobUpdateResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `service-job-update:${input.tenantId}:${input.jobId}`
    ]);
    const currentResult = await client.query<{ customer_id: string; status: ServiceJobStatus }>(
      `select customer_id, status
       from public.service_jobs
       where tenant_id = $1 and id = $2
       limit 1
       for update`,
      [input.tenantId, input.jobId]
    );
    const current = currentResult.rows[0];
    if (!current) {
      return {
        status: "not_found",
        jobId: input.jobId,
        customerId: null,
        previousStatus: null,
        currentStatus: null
      };
    }

    const scheduleStatus = input.status === "scheduled" || input.status === "in_progress" || input.status === "completed";
    const scheduledStart = input.preserveSchedule ? undefined : input.scheduledStart;
    const scheduledEnd = input.preserveSchedule ? undefined : input.scheduledEnd;
    await client.query(
      `update public.service_jobs
       set status = $3,
           scheduled_start = case when $9::boolean then scheduled_start else $4 end,
           scheduled_end = case when $9::boolean then scheduled_end else $5 end,
           dispatcher_notes = $6,
           completion_notes = $7,
           ai_next_action = $8,
           updated_at = now()
       where tenant_id = $1 and id = $2`,
      [
        input.tenantId,
        input.jobId,
        input.status,
        scheduledStart ?? null,
        scheduledEnd ?? null,
        input.dispatcherNotes,
        input.completionNotes,
        input.nextAction,
        input.preserveSchedule === true
      ]
    );

    if (scheduleStatus && !input.preserveSchedule && !scheduledStart && input.status === "scheduled") {
      throw new Error("A scheduled job requires a scheduled start time.");
    }

    const kernel = await synchronizeServiceKernelForJob(client, {
      tenantId: input.tenantId,
      jobId: input.jobId,
      eventSource: input.eventSource
    });
    if (!kernel) throw new Error("The service operating records could not be synchronized.");

    return {
      status: "updated",
      jobId: input.jobId,
      customerId: current.customer_id,
      previousStatus: current.status,
      currentStatus: input.status
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not update the service job safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export type InvoiceWorkflowUpdateResult = {
  status: "updated" | "not_found" | "payment_managed";
  invoiceId: string;
  customerId: string | null;
  currentStatus: string | null;
};

export async function updateInvoiceWorkflow(input: {
  tenantId: string;
  invoiceId: string;
  status: OperatorInvoiceStatus;
  dueDate: string | null;
  internalNotes: string | null;
  paymentNotes: string | null;
}): Promise<InvoiceWorkflowUpdateResult> {
  const transaction = await withPostgresTransactionResult<InvoiceWorkflowUpdateResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `invoice-workflow-update:${input.tenantId}:${input.invoiceId}`
    ]);
    const invoiceResult = await client.query<{ customer_id: string; status: string }>(
      `select customer_id, status
       from public.service_invoices
       where tenant_id = $1 and id = $2
       limit 1
       for update`,
      [input.tenantId, input.invoiceId]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      return { status: "not_found", invoiceId: input.invoiceId, customerId: null, currentStatus: null };
    }
    if (invoice.status === "paid" || invoice.status === "partially_paid" || invoice.status === "written_off") {
      await client.query(
        `update public.service_invoices
         set due_date = $3, internal_notes = $4, manual_payment_notes = $5, updated_at = now()
         where tenant_id = $1 and id = $2`,
        [input.tenantId, input.invoiceId, input.dueDate, input.internalNotes, input.paymentNotes]
      );
      return {
        status: "payment_managed",
        invoiceId: input.invoiceId,
        customerId: invoice.customer_id,
        currentStatus: invoice.status
      };
    }

    await client.query(
      `update public.service_invoices
       set status = $3, due_date = $4, internal_notes = $5, manual_payment_notes = $6, updated_at = now()
       where tenant_id = $1 and id = $2`,
      [input.tenantId, input.invoiceId, input.status, input.dueDate, input.internalNotes, input.paymentNotes]
    );
    return {
      status: "updated",
      invoiceId: input.invoiceId,
      customerId: invoice.customer_id,
      currentStatus: input.status
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not update the invoice safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export type InvoiceLineItemMutationResult = {
  status: "updated" | "locked" | "not_found";
  invoiceId: string;
  customerId: string | null;
};

async function mutateDraftInvoiceLineItems(input: {
  tenantId: string;
  invoiceId: string;
  operation: (client: import("pg").PoolClient) => Promise<void>;
}): Promise<InvoiceLineItemMutationResult> {
  const transaction = await withPostgresTransactionResult<InvoiceLineItemMutationResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `invoice-line-items:${input.tenantId}:${input.invoiceId}`
    ]);
    const invoiceResult = await client.query<{ customer_id: string; status: string }>(
      `select customer_id, status
       from public.service_invoices
       where tenant_id = $1 and id = $2
       limit 1
       for update`,
      [input.tenantId, input.invoiceId]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return { status: "not_found", invoiceId: input.invoiceId, customerId: null };
    if (invoice.status !== "draft") {
      return { status: "locked", invoiceId: input.invoiceId, customerId: invoice.customer_id };
    }

    await input.operation(client);
    await client.query(
      `update public.service_invoices
       set subtotal_cents = totals.total_cents,
           total_cents = greatest(0, totals.total_cents - discount_cents + tax_cents),
           updated_at = now()
       from (
         select coalesce(sum(total_cents), 0)::integer as total_cents
         from public.invoice_line_items
         where tenant_id = $1 and invoice_id = $2
       ) totals
       where tenant_id = $1 and id = $2`,
      [input.tenantId, input.invoiceId]
    );
    return { status: "updated", invoiceId: input.invoiceId, customerId: invoice.customer_id };
  });
  if (!transaction.ok) {
    throw new Error("Ferocity could not update the invoice line items safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export function saveDraftInvoiceLineItem(input: {
  tenantId: string;
  invoiceId: string;
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
}) {
  const totalCents = Math.round(input.quantity * input.unitPriceCents);
  return mutateDraftInvoiceLineItems({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    operation: async (client) => {
      if (input.itemId) {
        const result = await client.query(
          `update public.invoice_line_items
           set name = $4, description = $5, quantity = $6, unit_price_cents = $7, total_cents = $8
           where tenant_id = $1 and invoice_id = $2 and id = $3`,
          [input.tenantId, input.invoiceId, input.itemId, input.name, input.description, input.quantity, input.unitPriceCents, totalCents]
        );
        if (result.rowCount !== 1) throw new Error("The invoice line item was not found.");
        return;
      }
      await client.query(
        `insert into public.invoice_line_items
           (tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [input.tenantId, input.invoiceId, input.name, input.description, input.quantity, input.unitPriceCents, totalCents]
      );
    }
  });
}

export function deleteDraftInvoiceLineItem(input: {
  tenantId: string;
  invoiceId: string;
  itemId: string;
}) {
  return mutateDraftInvoiceLineItems({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    operation: async (client) => {
      const result = await client.query(
        "delete from public.invoice_line_items where tenant_id = $1 and invoice_id = $2 and id = $3",
        [input.tenantId, input.invoiceId, input.itemId]
      );
      if (result.rowCount !== 1) throw new Error("The invoice line item was not found.");
    }
  });
}

export type EstimateToJobResult = {
  status: "created" | "existing" | "not_found";
  jobId: string | null;
  estimateId: string;
  customerId: string | null;
  title: string | null;
  sourceLeadId: string | null;
};

export async function convertEstimateToJob(input: {
  tenantId: string;
  estimateId: string;
  scheduledStart: Date | string | null;
  scheduledEnd: Date | string | null;
  serviceArea: string | null;
  dispatcherNotes: string | null;
}): Promise<EstimateToJobResult> {
  const transaction = await withPostgresTransactionResult<EstimateToJobResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `estimate-to-job:${input.tenantId}:${input.estimateId}`
    ]);

    const existing = await client.query<{ id: string; customer_id: string; title: string; source_lead_id: string | null }>(
      `select id, customer_id, title, source_lead_id
       from public.service_jobs
       where tenant_id = $1 and estimate_id = $2
       order by created_at desc
       limit 1`,
      [input.tenantId, input.estimateId]
    );
    if (existing.rows[0]) {
      return {
        status: "existing",
        jobId: existing.rows[0].id,
        estimateId: input.estimateId,
        customerId: existing.rows[0].customer_id,
        title: existing.rows[0].title,
        sourceLeadId: existing.rows[0].source_lead_id
      };
    }

    const estimateResult = await client.query<{
      id: string;
      brand_id: string | null;
      customer_id: string;
      source_lead_id: string | null;
      title: string;
      status: string;
      internal_notes: string | null;
    }>(
      `select id, brand_id, customer_id, source_lead_id, title, status, internal_notes
       from public.service_estimates
       where tenant_id = $1 and id = $2
       limit 1
       for update`,
      [input.tenantId, input.estimateId]
    );
    const estimate = estimateResult.rows[0];
    if (!estimate) {
      return {
        status: "not_found",
        jobId: null,
        estimateId: input.estimateId,
        customerId: null,
        title: null,
        sourceLeadId: null
      };
    }

    const jobResult = await client.query<{ id: string }>(
      `insert into public.service_jobs (
         tenant_id, brand_id, customer_id, source_lead_id, estimate_id, title, status,
         scheduled_start, scheduled_end, service_area, dispatcher_notes, ai_next_action
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        input.tenantId,
        estimate.brand_id,
        estimate.customer_id,
        estimate.source_lead_id,
        estimate.id,
        estimate.title,
        input.scheduledStart ? "scheduled" : "unscheduled",
        input.scheduledStart,
        input.scheduledEnd,
        input.serviceArea,
        input.dispatcherNotes ?? estimate.internal_notes,
        input.scheduledStart
          ? "Confirm crew, materials, and customer arrival window."
          : "Schedule this approved work, assign the right person, and prep materials."
      ]
    );
    const jobId = jobResult.rows[0]?.id;
    if (!jobId) throw new Error("The job could not be created from the estimate.");

    if (estimate.status !== "approved") {
      await client.query(
        `update public.service_estimates
         set status = 'approved', updated_at = now()
         where tenant_id = $1 and id = $2 and status in ('draft', 'sent_manually')`,
        [input.tenantId, estimate.id]
      );
    }

    return {
      status: "created",
      jobId,
      estimateId: estimate.id,
      customerId: estimate.customer_id,
      title: estimate.title,
      sourceLeadId: estimate.source_lead_id
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not convert the estimate to a job safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export type JobToInvoiceResult = {
  status: "created" | "existing" | "not_found";
  invoiceId: string | null;
  jobId: string;
  estimateId: string | null;
  customerId: string | null;
  title: string | null;
};

export async function createInvoiceFromJob(input: {
  tenantId: string;
  jobId: string;
  dueDate: string | null;
}): Promise<JobToInvoiceResult> {
  const transaction = await withPostgresTransactionResult<JobToInvoiceResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `job-to-invoice:${input.tenantId}:${input.jobId}`
    ]);

    const existing = await client.query<{ id: string; customer_id: string; estimate_id: string | null; title: string }>(
      `select id, customer_id, estimate_id, title
       from public.service_invoices
       where tenant_id = $1 and job_id = $2 and status <> 'void'
       order by created_at desc
       limit 1`,
      [input.tenantId, input.jobId]
    );
    if (existing.rows[0]) {
      return {
        status: "existing",
        invoiceId: existing.rows[0].id,
        jobId: input.jobId,
        estimateId: existing.rows[0].estimate_id,
        customerId: existing.rows[0].customer_id,
        title: existing.rows[0].title
      };
    }

    const jobResult = await client.query<{
      id: string;
      brand_id: string | null;
      customer_id: string;
      estimate_id: string | null;
      title: string;
      estimate_total_cents: number | null;
    }>(
      `select j.id, j.brand_id, j.customer_id, j.estimate_id, j.title,
              e.total_cents as estimate_total_cents
       from public.service_jobs j
       left join public.service_estimates e on e.id = j.estimate_id and e.tenant_id = j.tenant_id
       where j.tenant_id = $1 and j.id = $2
       limit 1
       for update of j`,
      [input.tenantId, input.jobId]
    );
    const job = jobResult.rows[0];
    if (!job) {
      return {
        status: "not_found",
        invoiceId: null,
        jobId: input.jobId,
        estimateId: null,
        customerId: null,
        title: null
      };
    }

    const totalCents = job.estimate_total_cents ?? 0;
    const invoiceResult = await client.query<{ id: string }>(
      `insert into public.service_invoices (
         tenant_id, brand_id, customer_id, job_id, estimate_id, title, subtotal_cents,
         total_cents, due_date, internal_notes, manual_payment_notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10)
       returning id`,
      [
        input.tenantId,
        job.brand_id,
        job.customer_id,
        job.id,
        job.estimate_id,
        `Invoice - ${job.title}`,
        totalCents,
        input.dueDate,
        `Created from job ${job.title}. Review line items and payment terms before sending.`,
        "Payment request can be prepared from this invoice. Customer-facing sends still require approval."
      ]
    );
    const invoiceId = invoiceResult.rows[0]?.id;
    if (!invoiceId) throw new Error("The invoice could not be created from the job.");

    if (job.estimate_id) {
      await client.query(
        `insert into public.invoice_line_items (
           tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents, position
         )
         select tenant_id, $3::uuid, name, description, quantity, unit_price_cents, total_cents, position
         from public.estimate_line_items
         where tenant_id = $1 and estimate_id = $2
         order by position, name`,
        [input.tenantId, job.estimate_id, invoiceId]
      );
    }

    const copiedItems = await client.query<{ count: string }>(
      `select count(*)::text from public.invoice_line_items where tenant_id = $1 and invoice_id = $2`,
      [input.tenantId, invoiceId]
    );
    if (Number(copiedItems.rows[0]?.count ?? 0) === 0) {
      await client.query(
        `insert into public.invoice_line_items (tenant_id, invoice_id, name, quantity, unit_price_cents, total_cents)
         values ($1, $2, $3, 1, $4, $4)`,
        [input.tenantId, invoiceId, job.title, totalCents]
      );
    }

    await client.query(
      `update public.service_invoices i
       set subtotal_cents = totals.total_cents,
           total_cents = totals.total_cents,
           updated_at = now()
       from (
         select invoice_id, coalesce(sum(total_cents), 0)::integer as total_cents
         from public.invoice_line_items
         where tenant_id = $1 and invoice_id = $2
         group by invoice_id
       ) totals
       where i.tenant_id = $1 and i.id = totals.invoice_id`,
      [input.tenantId, invoiceId]
    );

    return {
      status: "created",
      invoiceId,
      jobId: job.id,
      estimateId: job.estimate_id,
      customerId: job.customer_id,
      title: job.title
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not create the invoice from the job safely.", { cause: transaction.error });
  }
  return transaction.value;
}

export type ManualInvoicePaymentResult = {
  status: "recorded" | "existing" | "not_found" | "no_balance";
  invoiceId: string;
  customerId: string | null;
  paymentId: string | null;
  amountCents: number;
  invoiceStatus: string | null;
};

export async function recordManualInvoicePayment(input: {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  note: string | null;
  idempotencyKey: string;
}): Promise<ManualInvoicePaymentResult> {
  const transaction = await withPostgresTransactionResult<ManualInvoicePaymentResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `invoice-payment:${input.tenantId}:${input.invoiceId}`
    ]);

    const recorded = await client.query<{
      customer_id: string;
      payment_id: string;
      amount_cents: number;
      invoice_status: string;
    }>(
      `with invoice as (
         select id, tenant_id, brand_id, customer_id, total_cents, amount_paid_cents, write_off_cents,
           greatest(total_cents - amount_paid_cents - write_off_cents, 0) as balance_due_cents
         from public.service_invoices
         where tenant_id = $1 and id = $2
         limit 1
         for update
       ), bounded as (
         select *, least($3::integer, balance_due_cents) as payment_cents
         from invoice
         where balance_due_cents > 0
       ), payment as (
         insert into public.service_invoice_payments (
           tenant_id, brand_id, customer_id, invoice_id, provider, status, amount_cents,
           net_cents, currency, paid_at, idempotency_key, metadata_json
         )
         select tenant_id, brand_id, customer_id, id, 'manual', 'succeeded', payment_cents,
           payment_cents, 'usd', now(), $5,
           jsonb_build_object('note', $4::text, 'source', 'manual_record')
         from bounded
         where payment_cents > 0
         on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing
         returning id, tenant_id, brand_id, customer_id, invoice_id, amount_cents
       ), ledger as (
         insert into public.service_ledger_entries (
           tenant_id, brand_id, customer_id, invoice_id, payment_id, entry_type, direction,
           amount_cents, currency, description, provider, metadata_json
         )
         select tenant_id, brand_id, customer_id, invoice_id, id, 'payment_received', 'credit',
           amount_cents, 'usd', coalesce(nullif($4::text, ''), 'Manual invoice payment recorded.'),
           'manual', jsonb_build_object('source', 'manual_record')
         from payment
       ), updated as (
         update public.service_invoices i
         set amount_paid_cents = least(i.total_cents, i.amount_paid_cents + p.amount_cents),
             status = case
               when least(i.total_cents, i.amount_paid_cents + p.amount_cents) + i.write_off_cents >= i.total_cents
                 then case when i.write_off_cents>0 then 'written_off' else 'paid' end
               else 'partially_paid'
             end,
             manual_payment_notes = concat_ws(E'\n', nullif(i.manual_payment_notes, ''), nullif($4::text, '')),
             updated_at = now()
         from payment p
         where i.tenant_id = $1 and i.id = p.invoice_id
         returning i.customer_id, i.status, p.id as payment_id, p.amount_cents
       )
       select customer_id, payment_id, amount_cents, status as invoice_status from updated`,
      [input.tenantId, input.invoiceId, input.amountCents, input.note ?? "", input.idempotencyKey]
    );
    const row = recorded.rows[0];
    if (row) {
      return {
        status: "recorded",
        invoiceId: input.invoiceId,
        customerId: row.customer_id,
        paymentId: row.payment_id,
        amountCents: row.amount_cents,
        invoiceStatus: row.invoice_status
      };
    }

    const existing = await client.query<{
      customer_id: string;
      payment_id: string | null;
      payment_cents: number | null;
      invoice_status: string;
      balance_due_cents: number;
    }>(
      `select i.customer_id, p.id as payment_id, p.amount_cents as payment_cents,
              i.status as invoice_status, greatest(i.total_cents - i.amount_paid_cents - i.write_off_cents, 0) as balance_due_cents
       from public.service_invoices i
       left join public.service_invoice_payments p
         on p.tenant_id = i.tenant_id and p.idempotency_key = $3
       where i.tenant_id = $1 and i.id = $2
       limit 1`,
      [input.tenantId, input.invoiceId, input.idempotencyKey]
    );
    const current = existing.rows[0];
    if (!current) {
      return {
        status: "not_found",
        invoiceId: input.invoiceId,
        customerId: null,
        paymentId: null,
        amountCents: 0,
        invoiceStatus: null
      };
    }
    if (current.payment_id) {
      return {
        status: "existing",
        invoiceId: input.invoiceId,
        customerId: current.customer_id,
        paymentId: current.payment_id,
        amountCents: current.payment_cents ?? 0,
        invoiceStatus: current.invoice_status
      };
    }
    return {
      status: "no_balance",
      invoiceId: input.invoiceId,
      customerId: current.customer_id,
      paymentId: null,
      amountCents: 0,
      invoiceStatus: current.invoice_status
    };
  });

  if (!transaction.ok) {
    throw new Error("Ferocity could not record the invoice payment safely.", { cause: transaction.error });
  }
  return transaction.value;
}
