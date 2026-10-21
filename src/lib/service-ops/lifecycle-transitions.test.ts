import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ withPostgresTransactionResult: transactionMock }));

const kernelMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/service-ops/service-kernel", () => ({ synchronizeServiceKernelForJob: kernelMock }));

import {
  convertEstimateToJob,
  createInvoiceFromJob,
  deleteDraftInvoiceLineItem,
  recordManualInvoicePayment,
  saveDraftInvoiceLineItem,
  updateInvoiceWorkflow,
  updateServiceJob
} from "./lifecycle-transitions";

describe("canonical service lifecycle transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kernelMock.mockResolvedValue({ locationId: "location-1", workOrderId: "work-order-1", visitId: "visit-1" });
  });

  it("updates a job and its operating kernel in one transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_jobs") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "in_progress" }] };
      }
      if (normalized.startsWith("update public.service_jobs")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const result = await updateServiceJob({
      tenantId: "tenant-1",
      jobId: "job-1",
      status: "completed",
      scheduledStart: "2026-10-15T10:00:00.000Z",
      scheduledEnd: "2026-10-15T12:00:00.000Z",
      dispatcherNotes: "Crew assigned",
      completionNotes: "Customer accepted the completed work.",
      nextAction: "Create invoice",
      eventSource: "user"
    });

    expect(result).toMatchObject({
      status: "updated",
      customerId: "customer-1",
      previousStatus: "in_progress",
      currentStatus: "completed"
    });
    expect(kernelMock).toHaveBeenCalledWith(expect.objectContaining({ query }), expect.objectContaining({
      tenantId: "tenant-1",
      jobId: "job-1",
      eventSource: "user"
    }));
  });

  it("rolls back the job update when its operating kernel cannot synchronize", async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_jobs") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "scheduled" }] };
      }
      if (normalized.startsWith("update public.service_jobs")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    kernelMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (operation) => {
      try {
        return { ok: true, value: await operation({ query }) };
      } catch (error) {
        return { ok: false, error };
      }
    });

    await expect(updateServiceJob({
      tenantId: "tenant-1",
      jobId: "job-1",
      status: "completed",
      dispatcherNotes: null,
      completionNotes: "Done",
      nextAction: null,
      eventSource: "worker",
      preserveSchedule: true
    })).rejects.toThrow("could not update the service job safely");
  });

  it("keeps payment-derived invoice status authoritative while allowing note updates", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      statements.push(normalized);
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "paid" }] };
      }
      if (normalized.startsWith("update public.service_invoices")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const result = await updateInvoiceWorkflow({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      status: "draft",
      dueDate: "2026-10-30",
      internalNotes: "Updated note",
      paymentNotes: null
    });

    expect(result).toMatchObject({ status: "payment_managed", currentStatus: "paid" });
    const updateSql = statements.find((statement) => statement.startsWith("update public.service_invoices"));
    expect(updateSql).not.toContain("set status");
  });

  it("updates a non-payment invoice status atomically", async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "draft" }] };
      }
      if (normalized.startsWith("update public.service_invoices")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    await expect(updateInvoiceWorkflow({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      status: "sent_manually",
      dueDate: null,
      internalNotes: null,
      paymentNotes: null
    })).resolves.toMatchObject({ status: "updated", currentStatus: "sent_manually" });
  });

  it("locks invoice line items once the invoice is issued", async () => {
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "sent_manually" }] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const result = await saveDraftInvoiceLineItem({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      itemId: null,
      name: "Repair",
      description: null,
      quantity: 1,
      unitPriceCents: 25000
    });

    expect(result).toMatchObject({ status: "locked", customerId: "customer-1" });
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("insert into public.invoice_line_items"))).toBe(false);
  });

  it("changes and recalculates draft invoice line items in the same transaction", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      statements.push(normalized);
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices") && normalized.includes("for update")) {
        return { rows: [{ customer_id: "customer-1", status: "draft" }] };
      }
      if (normalized.startsWith("delete from public.invoice_line_items")) return { rows: [], rowCount: 1 };
      if (normalized.startsWith("update public.service_invoices")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const result = await deleteDraftInvoiceLineItem({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      itemId: "item-1"
    });

    expect(result).toMatchObject({ status: "updated", customerId: "customer-1" });
    expect(statements.some((statement) => statement.startsWith("delete from public.invoice_line_items"))).toBe(true);
    expect(statements.some((statement) => statement.startsWith("update public.service_invoices"))).toBe(true);
  });

  it("creates one job for an estimate and preserves the originating lead", async () => {
    let job: Record<string, unknown> | null = null;
    let insertCount = 0;
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_jobs") && normalized.includes("estimate_id = $2")) {
        return { rows: job ? [job] : [] };
      }
      if (normalized.includes("from public.service_estimates") && normalized.includes("for update")) {
        return {
          rows: [{
            id: "estimate-1",
            brand_id: "brand-1",
            customer_id: "customer-1",
            source_lead_id: "lead-1",
            title: "Repair",
            status: "approved",
            internal_notes: null
          }]
        };
      }
      if (normalized.includes("insert into public.service_jobs")) {
        insertCount += 1;
        job = { id: "job-1", customer_id: "customer-1", title: "Repair", source_lead_id: "lead-1" };
        return { rows: [{ id: "job-1" }] };
      }
      if (normalized.includes("update public.service_estimates")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const input = {
      tenantId: "tenant-1",
      estimateId: "estimate-1",
      scheduledStart: null,
      scheduledEnd: null,
      serviceArea: null,
      dispatcherNotes: null
    };
    const created = await convertEstimateToJob(input);
    const retried = await convertEstimateToJob(input);

    expect(created).toMatchObject({ status: "created", jobId: "job-1", sourceLeadId: "lead-1" });
    expect(retried).toMatchObject({ status: "existing", jobId: "job-1", sourceLeadId: "lead-1" });
    expect(insertCount).toBe(1);
  });

  it("creates one invoice for a job and copies estimate line items inside the same transaction", async () => {
    let invoice: Record<string, unknown> | null = null;
    let insertCount = 0;
    let copied = false;
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices") && normalized.includes("job_id = $2")) {
        return { rows: invoice ? [invoice] : [] };
      }
      if (normalized.includes("from public.service_jobs j") && normalized.includes("for update of j")) {
        return {
          rows: [{
            id: "job-1",
            brand_id: "brand-1",
            customer_id: "customer-1",
            estimate_id: "estimate-1",
            title: "Repair",
            estimate_total_cents: 25000
          }]
        };
      }
      if (normalized.includes("insert into public.service_invoices")) {
        insertCount += 1;
        invoice = { id: "invoice-1", customer_id: "customer-1", estimate_id: "estimate-1", title: "Invoice - Repair" };
        return { rows: [{ id: "invoice-1" }] };
      }
      if (normalized.includes("insert into public.invoice_line_items") && normalized.includes("select tenant_id")) {
        copied = true;
        return { rows: [] };
      }
      if (normalized.includes("select count(*)::text from public.invoice_line_items")) {
        return { rows: [{ count: copied ? "1" : "0" }] };
      }
      if (normalized.includes("update public.service_invoices i")) return { rows: [] };
      if (normalized.includes("insert into public.invoice_line_items")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const input = { tenantId: "tenant-1", jobId: "job-1", dueDate: null };
    const created = await createInvoiceFromJob(input);
    const retried = await createInvoiceFromJob(input);

    expect(created).toMatchObject({ status: "created", invoiceId: "invoice-1", estimateId: "estimate-1" });
    expect(retried).toMatchObject({ status: "existing", invoiceId: "invoice-1" });
    expect(insertCount).toBe(1);
    expect(copied).toBe(true);
  });

  it("fails closed when a lifecycle transaction rolls back", async () => {
    transactionMock.mockResolvedValue({ ok: false, error: new Error("rollback") });
    await expect(convertEstimateToJob({
      tenantId: "tenant-1",
      estimateId: "estimate-1",
      scheduledStart: null,
      scheduledEnd: null,
      serviceArea: null,
      dispatcherNotes: null
    })).rejects.toThrow("could not convert the estimate to a job safely");
  });

  it("bounds a manual payment to the invoice and makes retries idempotent", async () => {
    let recorded = false;
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.startsWith("with invoice as")) {
        if (recorded) return { rows: [] };
        recorded = true;
        return {
          rows: [{
            customer_id: "customer-1",
            payment_id: "payment-1",
            amount_cents: 25000,
            invoice_status: "paid"
          }]
        };
      }
      if (normalized.includes("left join public.service_invoice_payments")) {
        return {
          rows: [{
            customer_id: "customer-1",
            payment_id: "payment-1",
            payment_cents: 25000,
            invoice_status: "paid",
            balance_due_cents: 0
          }]
        };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));
    const input = {
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      amountCents: 50000,
      note: "Paid in person",
      idempotencyKey: "idem-1"
    };

    const first = await recordManualInvoicePayment(input);
    const retry = await recordManualInvoicePayment(input);

    expect(first).toMatchObject({ status: "recorded", paymentId: "payment-1", amountCents: 25000 });
    expect(retry).toMatchObject({ status: "existing", paymentId: "payment-1", amountCents: 25000 });
  });
});
