import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  confirmWorkerPayAllocation,
  isWorkerDebtKind,
  parseWorkerMoneyToCents,
  recordWorkerBalanceRepayment
} from "./worker-balance-ledger";

describe("worker money parsing", () => {
  it("parses explicit English and Spanish decimals without changing value", () => {
    expect(parseWorkerMoneyToCents("12.50", "en")).toBe(1250);
    expect(parseWorkerMoneyToCents("12,50", "es")).toBe(1250);
    expect(parseWorkerMoneyToCents("1,234.56", "en")).toBe(123456);
    expect(parseWorkerMoneyToCents("1.234,56", "es")).toBe(123456);
    expect(parseWorkerMoneyToCents("$ 12.50 USD", "en")).toBe(1250);
  });

  it("rejects wrong-locale, ambiguous mixed, zero, negative, and out-of-bounds values", () => {
    expect(parseWorkerMoneyToCents("12,50", "en")).toBeNull();
    expect(parseWorkerMoneyToCents("12.50", "es")).toBeNull();
    expect(parseWorkerMoneyToCents("1,23.45", "en")).toBeNull();
    expect(parseWorkerMoneyToCents("1.23,45", "es")).toBeNull();
    expect(parseWorkerMoneyToCents("0", "en")).toBeNull();
    expect(parseWorkerMoneyToCents("-10.00", "en")).toBeNull();
    expect(parseWorkerMoneyToCents("1,000,000.01", "en")).toBeNull();
  });

  it("does not classify gifts, employer costs, reimbursements, or loss/damage as debt", () => {
    expect(isWorkerDebtKind("cash_advance")).toBe(true);
    expect(isWorkerDebtKind("personal_purchase")).toBe(true);
    expect(isWorkerDebtKind("gift")).toBe(false);
    expect(isWorkerDebtKind("business_expense")).toBe(false);
    expect(isWorkerDebtKind("reimbursement")).toBe(false);
    expect(isWorkerDebtKind("loss_damage")).toBe(false);
  });
});

function ledgerHarness(options: { authorized?: boolean; recovered?: number; currency?: string;repaymentInsertWinner?: Record<string,unknown>;allocationInsertWinner?: Record<string,unknown> } = {}) {
  const state = {
    recovered: options.recovered ?? 2_000,
    repaymentKeys: new Map<string,Record<string,unknown>>(),
    allocationKeys: new Map<string,Record<string,unknown>>(),
    events: 0
  };
  const client = {
    async query<T>(sql: string, values: unknown[] = []) {
      if (sql.includes("from public.employee_advance_repayments") && sql.includes("idempotency_key=$2")) {
        const row = state.repaymentKeys.get(String(values[1]));
        return { rows: row ? [row as T] : [],rowCount: row ? 1 : 0 };
      }
      if (sql.includes("from public.employee_advance_pay_allocations") && sql.includes("idempotency_key=$2")) {
        const row = state.allocationKeys.get(String(values[1]));
        return { rows: row ? [row as T] : [],rowCount: row ? 1 : 0 };
      }
      if (sql.includes("from public.employee_cash_advances") && sql.includes("for update")) {
        return { rows: [{
          id: "advance-a",worker_id: "worker-a",amount_cents: 10_000,currency: options.currency ?? "USD",
          is_worker_debt: true,approval_status: "approved",
          worker_authorization_status: options.authorized === false ? "pending" : "authorized",status: "acknowledged"
        } as T], rowCount: 1 };
      }
      if (sql.includes("as recovered_cents")) return { rows: [{ recovered_cents: String(state.recovered) } as T], rowCount: 1 };
      if (sql.includes("insert into public.employee_advance_repayments")) {
        const key = String(values[8]);
        if (state.repaymentKeys.has(key)) return { rows: [] as T[], rowCount: 0 };
        if (options.repaymentInsertWinner) { state.repaymentKeys.set(key,options.repaymentInsertWinner);return { rows: [] as T[],rowCount: 0 }; }
        state.repaymentKeys.set(key,{ advance_id: values[1],amount_cents: values[3],repaid_at: values[5],repayment_method: values[6],note: values[7] }); state.recovered += Number(values[3]);
        return { rows: [{ id: "repayment-a" } as T], rowCount: 1 };
      }
      if (sql.includes("insert into public.employee_advance_pay_allocations")) {
        const key = String(values[10]);
        if (state.allocationKeys.has(key)) return { rows: [] as T[], rowCount: 0 };
        if (options.allocationInsertWinner) { state.allocationKeys.set(key,options.allocationInsertWinner);return { rows: [] as T[],rowCount: 0 }; }
        state.allocationKeys.set(key,{ advance_id: values[1],amount_cents: values[5],pay_period_start: values[3],pay_period_end: values[4],worker_authorization_evidence: values[7],legal_policy_review: values[8] }); state.recovered += Number(values[5]);
        return { rows: [{ id: "allocation-a" } as T], rowCount: 1 };
      }
      if (sql.includes("insert into public.employee_advance_events")) { state.events += 1; return { rows: [] as T[], rowCount: 1 }; }
      if (sql.includes("update public.employee_cash_advances")) return { rows: [] as T[], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  return { state, client };
}

describe("worker balance recovery", () => {
  it("records partial repayments once and rejects amounts above the locked outstanding balance", async () => {
    const harness = ledgerHarness();
    const input = {
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 3_000,repaidAt: "2026-10-27",
      method: "cash" as const,note: "cash receipt",idempotencyKey: "repayment-key",actorUserId: "owner-a"
    };
    expect(await recordWorkerBalanceRepayment(harness.client as never, input)).toEqual({ outcome: "recorded", outstandingCents: 5_000 });
    expect(await recordWorkerBalanceRepayment(harness.client as never, input)).toEqual({ outcome: "already_recorded" });
    expect(await recordWorkerBalanceRepayment(harness.client as never, { ...input, amountCents: 6_000, idempotencyKey: "too-much" })).toEqual({ outcome: "exceeds_outstanding", outstandingCents: 5_000 });
    expect(harness.state.events).toBe(1);
  });

  it("uses the submission identity without collapsing legitimate same-detail payments", async () => {
    const harness = ledgerHarness({ recovered: 0 });
    const base = { tenantId: "tenant-a",advanceId: "advance-a",amountCents: 2_000,repaidAt: "2026-10-27",method: "cash" as const,note: "receipt",idempotencyKey: "request-a",actorUserId: "manager-a" };
    expect((await recordWorkerBalanceRepayment(harness.client as never,base)).outcome).toBe("recorded");
    expect((await recordWorkerBalanceRepayment(harness.client as never,{ ...base,idempotencyKey: "request-b" })).outcome).toBe("recorded");
    expect(harness.state.recovered).toBe(4_000);
  });

  it("replays the same immutable request across actors and rejects payload reuse", async () => {
    const harness = ledgerHarness({ recovered: 0 });
    const base = { tenantId: "tenant-a",advanceId: "advance-a",amountCents: 10_000,repaidAt: "2026-10-27",method: "cash" as const,note: "paid in full",idempotencyKey: "stable-request",actorUserId: "manager-a" };
    expect((await recordWorkerBalanceRepayment(harness.client as never,base)).outcome).toBe("recorded");
    expect(await recordWorkerBalanceRepayment(harness.client as never,{ ...base,actorUserId: "manager-b" })).toEqual({ outcome: "already_recorded" });
    expect(await recordWorkerBalanceRepayment(harness.client as never,{ ...base,actorUserId: "manager-b",amountCents: 9_000 })).toEqual({ outcome: "idempotency_conflict" });
  });

  it("re-reads a concurrent repayment winner and rejects a different winning payload", async () => {
    const harness = ledgerHarness({ recovered: 0,repaymentInsertWinner: { advance_id: "advance-b",amount_cents: 1000,repaid_at: "2026-10-27",repayment_method: "cash",note: "other" } });
    expect(await recordWorkerBalanceRepayment(harness.client as never,{
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 2_000,repaidAt: "2026-10-27",method: "cash",note: "mine",idempotencyKey: "raced",actorUserId: "manager-a"
    })).toEqual({ outcome: "idempotency_conflict" });
  });

  it("requires worker authorization and written legal-policy evidence before confirming a pay allocation", async () => {
    const unauthorized = ledgerHarness({ authorized: false });
    const base = {
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 2_500,
      payPeriodStart: "2026-10-26",payPeriodEnd: "2026-11-01",
      workerAuthorizationEvidence: "Worker signed terms on 2026-10-27",
      legalPolicyReview: "Manager reviewed applicable policy",idempotencyKey: "allocation-key",actorUserId: "owner-a"
    };
    expect(await confirmWorkerPayAllocation(unauthorized.client as never, base)).toEqual({ outcome: "not_authorized" });
    const authorized = ledgerHarness();
    expect(await confirmWorkerPayAllocation(authorized.client as never, { ...base, legalPolicyReview: "" })).toEqual({ outcome: "missing_evidence" });
    expect(await confirmWorkerPayAllocation(authorized.client as never, base)).toEqual({ outcome: "confirmed", outstandingCents: 5_500 });
    expect(await confirmWorkerPayAllocation(authorized.client as never, base)).toEqual({ outcome: "already_confirmed" });
  });

  it("counts prior-period allocations before allowing another period to use the balance", async () => {
    const harness = ledgerHarness();
    const base = {
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 6_000,
      payPeriodStart: "2026-10-19",payPeriodEnd: "2026-10-25",
      workerAuthorizationEvidence: "Worker signed the amount and terms",
      legalPolicyReview: "Manager reviewed the applicable policy",
      idempotencyKey: "period-one",actorUserId: "owner-a"
    };
    expect(await confirmWorkerPayAllocation(harness.client as never, base)).toEqual({ outcome: "confirmed", outstandingCents: 2_000 });
    expect(await confirmWorkerPayAllocation(harness.client as never, {
      ...base,
      amountCents: 3_000,
      payPeriodStart: "2026-10-26",
      payPeriodEnd: "2026-11-01",
      idempotencyKey: "period-two"
    })).toEqual({ outcome: "exceeds_outstanding", outstandingCents: 2_000 });
  });

  it("does not net a foreign-currency balance against the USD pay preview", async () => {
    const harness = ledgerHarness({ currency: "CAD" });
    expect(await confirmWorkerPayAllocation(harness.client as never, {
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 1_000,
      payPeriodStart: "2026-10-26",payPeriodEnd: "2026-11-01",
      workerAuthorizationEvidence: "Worker signed the amount and terms",
      legalPolicyReview: "Manager reviewed the applicable policy",
      idempotencyKey: "cad-allocation",actorUserId: "owner-a"
    })).toEqual({ outcome: "currency_not_supported", currency: "CAD" });
  });

  it("re-reads a concurrent allocation winner and rejects a different winning payload", async () => {
    const harness = ledgerHarness({ recovered: 0,allocationInsertWinner: { advance_id: "advance-b",amount_cents: 1000,pay_period_start: "2026-10-26",pay_period_end: "2026-11-01",worker_authorization_evidence: "other",legal_policy_review: "other" } });
    expect(await confirmWorkerPayAllocation(harness.client as never,{
      tenantId: "tenant-a",advanceId: "advance-a",amountCents: 2_000,payPeriodStart: "2026-10-26",payPeriodEnd: "2026-11-01",
      workerAuthorizationEvidence: "signed",legalPolicyReview: "reviewed",idempotencyKey: "raced-allocation",actorUserId: "manager-a"
    })).toEqual({ outcome: "idempotency_conflict" });
  });
});

describe("worker balance database boundary", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/279_worker_balance_ledger.sql"), "utf8");
  const actions = readFileSync(resolve(process.cwd(), "src/app/app/operations-workforce/actions.ts"), "utf8");

  it("keeps browser roles read-only, including legacy column grants", () => {
    expect(migration).toContain("drop policy if exists employee_cash_advances_operator");
    expect(migration).toContain("create policy employee_cash_advances_tenant_read");
    expect(migration).toContain("for select");
    expect(migration).toContain("revoke insert, update, delete, truncate, references, trigger");
    expect(migration).toContain("revoke insert (%s), update (%s)");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("separates non-debt categories and reverses rather than erases recovery evidence", () => {
    expect(migration).toContain("employee_cash_advances_non_debt_kind_check");
    expect(migration).toContain("'gift','business_expense','reimbursement','loss_damage'");
    expect(actions).toContain("status='reversed',reversed_by_user_id");
    expect(actions).toContain('requirePermission("tenant:manage")');
    expect(actions).toContain("update public.employee_advance_repayments");
    expect(actions).toContain("update public.employee_advance_pay_allocations");
    expect(actions).not.toMatch(/update public\.operations_time_entries[\s\S]{0,500}employee_advance/);
  });
});
