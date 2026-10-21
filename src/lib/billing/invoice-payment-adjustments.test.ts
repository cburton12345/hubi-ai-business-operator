import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  recordInvoiceRefundAcrossPaymentsWithClient,
  recordInvoiceRefundWithClient,
  recordInvoiceWriteOff
} from "@/lib/billing/invoice-payment-adjustments";

vi.mock("@/lib/db/postgres", () => ({
  withPostgresTransactionResult: vi.fn()
}));
import { withPostgresTransactionResult } from "@/lib/db/postgres";

function clientFor(input: { existingRefund?: boolean; refundedAmountCents?: number } = {}) {
  const queries: { text: string; values: unknown[] }[] = [];
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    queries.push({ text, values });
    if (text.includes("from public.service_invoice_payments") && text.includes("for update")) {
      return {
        rows: [{
          id: "11111111-1111-4111-8111-111111111111",
          invoice_id: "22222222-2222-4222-8222-222222222222",
          customer_id: "33333333-3333-4333-8333-333333333333",
          brand_id: null,
          provider: "stripe",
          amount_cents: 1000,
          refunded_amount_cents: input.refundedAmountCents ?? 0,
          currency: "usd"
        }],
        rowCount: 1
      };
    }
    if (text.includes("select id,amount_cents from public.payment_refunds")) {
      return input.existingRefund
        ? { rows: [{ id: "44444444-4444-4444-8444-444444444444", amount_cents: 300 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (text.includes("insert into public.payment_refunds")) {
      return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { client: { query } as unknown as pg.PoolClient, queries };
}

const base = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  paymentId: "11111111-1111-4111-8111-111111111111",
  amountCents: 500,
  amountMode: "cumulative" as const,
  idempotencyKey: "stripe:evt_refund_1",
  reason: "Provider refund",
  source: "stripe_webhook"
};

describe("invoice payment refund reconciliation", () => {
  it("records only the incremental delta from a cumulative provider total", async () => {
    const { client, queries } = clientFor({ refundedAmountCents: 200 });
    const result = await recordInvoiceRefundWithClient(client, base);

    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("Expected a recorded refund.");
    expect(result.refundDeltaCents).toBe(300);
    expect(result.cumulativeRefundCents).toBe(500);
    const refundInsert = queries.find((entry) => entry.text.includes("insert into public.payment_refunds"));
    expect(refundInsert?.values[2]).toBe(300);
    const ledgerInsert = queries.find((entry) => entry.text.includes("insert into public.service_ledger_entries"));
    expect(ledgerInsert?.values[5]).toBe(300);
    expect(queries.some((entry) => entry.text.includes("amount_paid_cents=greatest(amount_paid_cents-$3,0)"))).toBe(true);
    expect(queries.some((entry) => entry.text.includes("adjust_earn_for_refund"))).toBe(true);
  });

  it("returns an idempotent result without changing money twice", async () => {
    const { client, queries } = clientFor({ existingRefund: true, refundedAmountCents: 500 });
    const result = await recordInvoiceRefundWithClient(client, base);

    expect(result.status).toBe("already_recorded");
    expect(result.refundDeltaCents).toBe(0);
    expect(queries.some((entry) => entry.text.includes("update public.service_invoices"))).toBe(false);
    expect(queries.some((entry) => entry.text.includes("insert into public.service_ledger_entries"))).toBe(false);
  });

  it("refuses ambiguous provider matching", async () => {
    const { client } = clientFor();
    await expect(recordInvoiceRefundWithClient(client, { ...base, paymentId: undefined })).rejects.toThrow(
      "exact provider payment binding"
    );
  });

  it("allocates one invoice return across multiple recorded payments without over-refunding either payment", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    let refundSequence = 0;
    const paymentRows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        invoice_id: "22222222-2222-4222-8222-222222222222",
        customer_id: "33333333-3333-4333-8333-333333333333",
        brand_id: null,
        provider: "manual",
        amount_cents: 600,
        refunded_amount_cents: 0,
        currency: "usd"
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        invoice_id: "22222222-2222-4222-8222-222222222222",
        customer_id: "33333333-3333-4333-8333-333333333333",
        brand_id: null,
        provider: "external",
        amount_cents: 500,
        refunded_amount_cents: 0,
        currency: "usd"
      }
    ];
    const client = {
      query: vi.fn(async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes("from public.service_invoices") && text.includes("for update")) {
          return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }], rowCount: 1 };
        }
        if (text.includes("metadata_json->>'allocationKey'")) return { rows: [], rowCount: 0 };
        if (text.includes("from public.service_invoice_payments") && text.includes("order by paid_at")) {
          return { rows: paymentRows, rowCount: paymentRows.length };
        }
        if (text.includes("from public.service_invoice_payments") && text.includes("limit 1") && text.includes("for update")) {
          const row = paymentRows.find((payment) => payment.id === values[1]);
          return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
        }
        if (text.includes("select id,amount_cents from public.payment_refunds")) return { rows: [], rowCount: 0 };
        if (text.includes("insert into public.payment_refunds")) {
          refundSequence += 1;
          return { rows: [{ id: `44444444-4444-4444-8444-44444444444${refundSequence}` }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      })
    } as unknown as pg.PoolClient;

    const result = await recordInvoiceRefundAcrossPaymentsWithClient(client, {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      invoiceId: "22222222-2222-4222-8222-222222222222",
      amountCents: 900,
      idempotencyKey: "pos-return:66666666-6666-4666-8666-666666666666",
      reason: "Returned items",
      source: "ferocity_pos",
      reduceInvoiceTotal: true,
      invoiceCreditCents: 900
    });

    expect(result).toMatchObject({ status: "recorded", refundDeltaCents: 900, cumulativeAllocationCents: 900 });
    const inserts = queries.filter((entry) => entry.text.includes("insert into public.payment_refunds"));
    expect(inserts.map((entry) => entry.values[2])).toEqual([600, 300]);
    expect(inserts.map((entry) => String(entry.values[5]))).toEqual([
      "pos-return:66666666-6666-4666-8666-666666666666:11111111-1111-4111-8111-111111111111",
      "pos-return:66666666-6666-4666-8666-666666666666:55555555-5555-4555-8555-555555555555"
    ]);
  });

  it("fails the entire invoice allocation before writing when the refundable balance is insufficient", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        queries.push(text);
        if (text.includes("from public.service_invoices") && text.includes("for update")) {
          return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }], rowCount: 1 };
        }
        if (text.includes("metadata_json->>'allocationKey'")) return { rows: [], rowCount: 0 };
        if (text.includes("from public.service_invoice_payments") && text.includes("order by paid_at")) {
          return { rows: [{
            id: "11111111-1111-4111-8111-111111111111",
            invoice_id: "22222222-2222-4222-8222-222222222222",
            customer_id: "33333333-3333-4333-8333-333333333333",
            brand_id: null,
            provider: "manual",
            amount_cents: 500,
            refunded_amount_cents: 100,
            currency: "usd"
          }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      })
    } as unknown as pg.PoolClient;

    const result = await recordInvoiceRefundAcrossPaymentsWithClient(client, {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      invoiceId: "22222222-2222-4222-8222-222222222222",
      amountCents: 500,
      idempotencyKey: "pos-return:77777777-7777-4777-8777-777777777777",
      reason: "Returned items",
      source: "ferocity_pos"
    });

    expect(result).toMatchObject({ status: "insufficient_refundable_balance", refundDeltaCents: 0, remainingRefundableCents: 400 });
    expect(queries.some((text) => text.includes("insert into public.payment_refunds"))).toBe(false);
  });
});

describe("invoice write-off reconciliation", () => {
  it("bounds a write-off to the collectible balance and stops pending collection", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes("from public.service_invoices") && text.includes("for update")) {
          return { rows: [{
            id: "22222222-2222-4222-8222-222222222222",
            brand_id: null,
            customer_id: "33333333-3333-4333-8333-333333333333",
            total_cents: 1000,
            amount_paid_cents: 250,
            write_off_cents: 100,
            currency: "usd"
          }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      })
    } as unknown as pg.PoolClient;
    vi.mocked(withPostgresTransactionResult).mockImplementation(async (operation) => ({ ok: true, value: await operation(client) }));

    const result = await recordInvoiceWriteOff({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      invoiceId: "22222222-2222-4222-8222-222222222222",
      amountCents: 900,
      idempotencyKey: "manual-write-off:55555555-5555-4555-8555-555555555555",
      reason: "Owner approved uncollectible balance"
    });

    expect(result).toMatchObject({ status: "recorded", writeOffDeltaCents: 650, balanceDueCents: 0 });
    const ledger = queries.find((entry) => entry.text.includes("insert into public.service_ledger_entries"));
    expect(ledger?.values[4]).toBe(650);
    expect(queries.some((entry) => entry.text.includes("status=case when $4=0 then 'written_off'"))).toBe(true);
    expect(queries.some((entry) => entry.text.includes("update public.outbound_action_queue"))).toBe(true);
  });
});
