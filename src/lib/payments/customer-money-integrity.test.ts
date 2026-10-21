import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/257_customer_money_reconciliation.sql");
const adjustments = source("src/lib/billing/invoice-payment-adjustments.ts");
const stripeWebhook = source("src/app/api/integrations/stripe/webhook/route.ts");
const reminderAgent = source("src/lib/ai-workforce/agent-workflows.ts");
const messageProcessor = source("src/lib/actions-queue/process-ready-messages.ts");
const serviceActions = source("src/app/app/service/actions.ts");
const businessLoop = source("src/lib/business-loop/sync-golden-loop.ts");
const revenueDashboard = source("src/lib/revenue-growth/get-revenue-growth-dashboard.ts");
const dashboard = source("src/lib/dashboard/get-dashboard-snapshot.ts");

describe("customer money integrity contracts", () => {
  it("gives refunds and provider disputes durable unique identities", () => {
    expect(migration).toContain("payment_refunds_idempotency_unique");
    expect(migration).toContain("payment_refunds_provider_identity_unique");
    expect(migration).toContain("payment_disputes_provider_identity_unique");
    expect(migration).toContain("Historical refund reconciled into the canonical refund ledger");
  });

  it("uses one atomic refund path for payment, invoice, ledger, and Earn", () => {
    expect(adjustments).toContain("for update");
    expect(adjustments).toContain('input.amountMode === "cumulative"');
    expect(adjustments).toContain("refundDeltaCents");
    expect(adjustments).toContain("update public.service_invoice_payments");
    expect(adjustments).toContain("update public.service_invoices");
    expect(adjustments).toContain("insert into public.service_ledger_entries");
    expect(adjustments).toContain("adjust_earn_for_refund");
  });

  it("resolves refund and dispute ownership from the exact stored Stripe payment", () => {
    expect(stripeWebhook).toContain("Stripe refund metadata did not match its authoritative payment binding");
    expect(stripeWebhook).toContain("where provider='stripe' and provider_payment_id=$1");
    expect(stripeWebhook).toContain('amountMode: "cumulative"');
    expect(stripeWebhook).toContain("payment_disputes");
    expect(stripeWebhook).toContain("stripe-dispute-lost:");
  });

  it("blocks collection preparation and send-time delivery while a dispute is active", () => {
    for (const implementation of [reminderAgent, messageProcessor, serviceActions]) {
      expect(implementation).toContain("payment_disputes");
      expect(implementation).toContain("'warning','needs_response','under_review'");
    }
    expect(messageProcessor).toContain("invoice_collection_blocked");
    expect(messageProcessor).toContain("Collection communication stopped because the payment is disputed.");
  });

  it("makes approved write-offs idempotent and removes them from collectible balance", () => {
    expect(migration).toContain("'written_off'");
    expect(adjustments).toContain("invoice-write-off:");
    expect(adjustments).toContain("entry_type='write_off'");
    expect(adjustments).toContain("write_off_cents=write_off_cents+$3");
    expect(adjustments).toContain("Collection communication stopped because the invoice balance was written off.");
  });

  it("reports net collected cash and allocates job cost proportionally across split payments", () => {
    for (const implementation of [businessLoop, revenueDashboard, dashboard]) {
      expect(implementation).toContain("refunded_amount_cents");
    }
    expect(businessLoop).toContain("* greatest(p.amount_cents-p.refunded_amount_cents,0)::numeric / i.total_cents");
    expect(businessLoop).not.toContain("p.amount_cents - coalesce(mat.material_cents, 0) - coalesce(pay.worker_cents, 0)");
  });
});
