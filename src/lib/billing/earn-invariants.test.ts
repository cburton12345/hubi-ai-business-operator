import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Ferocity Earn V1 billing invariants", () => {
  const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/186_ferocity_earn_v1.sql"), "utf8");
  const actions = fs.readFileSync(path.join(process.cwd(), "src/app/app/billing/earn/actions.ts"), "utf8");
  const stripeWebhook = fs.readFileSync(path.join(process.cwd(), "src/app/api/integrations/stripe/webhook/route.ts"), "utf8");
  const serviceActions = fs.readFileSync(path.join(process.cwd(), "src/app/app/service/actions.ts"), "utf8");
  const settlementRunner = fs.readFileSync(path.join(process.cwd(), "src/lib/billing/earn-settlement.ts"), "utf8");
  const automationRunner = fs.readFileSync(path.join(process.cwd(), "src/lib/automation/run-business-automation.ts"), "utf8");

  it("keeps fixed plans and requires explicit prospective enrollment", () => {
    expect(migration).toContain("It does not enroll existing tenants or assess historical payments");
    expect(actions).toContain('accepted: z.literal("yes")');
    expect(actions).toContain("effective_at");
    expect(actions).toContain("cancel_at_period_end");
    expect(migration).not.toMatch(/insert into public\.earn_enrollments[\s\S]*select[\s\S]*from public\.tenants/i);
  });

  it("locks the only V1 classifications and rates without stacking", () => {
    expect(migration).toContain("locked_rate_bps in (0,90,600)");
    expect(migration).toContain("classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED' and locked_rate_bps=90");
    expect(migration).toContain("classification='FEROCITY_ORIGINATED' and locked_rate_bps=600");
    expect(actions).toContain('"NEEDS_REVIEW"');
  });

  it("accrues only from successful collected payments and excludes tax", () => {
    expect(migration).toContain("new.status in ('succeeded','manual')");
    expect(migration).toContain("v_payment.allocated_tax_cents");
    expect(migration).toContain("v_invoice.tax_cents");
    expect(migration).toContain("earn_payment_exclusions");
  });

  it("prevents duplicate payment and Earn assessment events", () => {
    expect(migration).toContain("unique (tenant_id, source_event_key)");
    expect(migration).toContain("uniq_service_invoice_payments_idempotency");
    expect(serviceActions).toContain("on conflict (tenant_id,idempotency_key)");
    expect(stripeWebhook).toContain("on conflict (provider, provider_payment_id)");
  });

  it("uses append-only corrections and refund credits", () => {
    expect(migration).toContain("prevent_earn_ledger_mutation");
    expect(migration).toContain("adjust_earn_for_refund");
    expect(migration).toContain("'earn_credit'");
    expect(stripeWebhook).toContain("adjust_earn_for_refund");
  });

  it("keeps privileged Earn accounting functions off public tenant RPC", () => {
    expect(migration).toContain("revoke all on function public.accrue_earn_for_payment(uuid) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.trigger_accrue_earn_for_payment() from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.adjust_earn_for_refund(uuid,integer,text,text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.adjust_earn_for_refund(uuid,integer,text,text) to service_role");
  });

  it("keeps provider usage separate from the Earn ledger", () => {
    expect(migration).toContain('"providerUsageSeparate":true');
    expect(migration).not.toContain("references public.billing_usage_charges");
  });

  it("keeps external settlement disabled by default and webhook-confirmed", () => {
    expect(settlementRunner).toContain('FEROCITY_EARN_SETTLEMENT_ENABLED !== "true"');
    expect(settlementRunner).toContain('collection_method: "charge_automatically"');
    expect(settlementRunner).toContain("idempotencyKey: `${row.idempotency_key}:invoice`");
    expect(settlementRunner).toContain('eventType: "invoice.paid" | "invoice.payment_failed" | "invoice.voided"');
    expect(automationRunner).toContain("syncDueEarnSettlementForTenant");
  });
});
