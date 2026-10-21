import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ withPostgresTransactionResult: transactionMock }));

import { ensureInvoiceReviewEnrollment, invoiceReviewSchedule } from "./invoice-review-enrollment";

describe("invoice review enrollment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only schedules sent-invoice reviews after work is complete", () => {
    expect(invoiceReviewSchedule("invoice_sent", false)).toMatchObject({ eligible: false });
    expect(invoiceReviewSchedule("invoice_sent", true)).toMatchObject({
      eligible: true,
      triggerEvent: "job_completed",
      delayHours: 24
    });
    expect(invoiceReviewSchedule("invoice_paid", false)).toMatchObject({
      eligible: true,
      triggerEvent: "invoice_paid",
      delayHours: 2
    });
  });

  it("creates at most one review workflow for an invoice/job", async () => {
    let created = false;
    const query = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (normalized.includes("from public.service_invoices i")) {
        return { rows: [{
          tenant_id: "tenant-1",
          brand_id: "brand-1",
          customer_id: "customer-1",
          job_id: "job-1",
          lead_id: "lead-1",
          job_status: "completed"
        }] };
      }
      if (normalized.includes("insert into public.review_request_workflows")) {
        if (created) return { rows: [] };
        created = true;
        return { rows: [{ id: "review-1" }] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    const first = await ensureInvoiceReviewEnrollment({ tenantId: "tenant-1", invoiceId: "invoice-1", event: "invoice_paid" });
    const retry = await ensureInvoiceReviewEnrollment({ tenantId: "tenant-1", invoiceId: "invoice-1", event: "invoice_paid" });

    expect(first).toMatchObject({ created: true, workflowId: "review-1" });
    expect(retry).toEqual({ created: false, reason: "already_enrolled" });
  });

  it("fails closed when enrollment cannot be verified", async () => {
    transactionMock.mockResolvedValue({ ok: false, error: new Error("database unavailable") });
    await expect(ensureInvoiceReviewEnrollment({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      event: "invoice_paid"
    })).rejects.toThrow("could not prepare the review workflow safely");
  });
});
