import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/app/service/actions.ts"), "utf8");
const stripeWebhookSource = readFileSync(join(process.cwd(), "src/app/api/integrations/stripe/webhook/route.ts"), "utf8");
const lifecycleSource = readFileSync(join(process.cwd(), "src/lib/service-ops/lifecycle-transitions.ts"), "utf8");

function actionBody(name: string) {
  const start = source.indexOf(`export async function ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("service action workspace safety", () => {
  it("keeps customer-scoped money and job mutations behind a workspace ownership check", () => {
    for (const name of ["createEstimateAction", "createJobAction", "createInvoiceAction"]) {
      const body = actionBody(name);
      expect(body).toContain("customerBelongsToWorkspace");
      expect(body).toContain("workspaceId");
    }
  });

  it("keeps simple create actions protected against fast duplicate submissions", () => {
    expect(actionBody("createCustomerAction")).toContain("recentCustomerExists");
    expect(actionBody("createEstimateAction")).toContain("recentMoneyRecordExists");
    expect(actionBody("createJobAction")).toContain("recentJobExists");
    expect(actionBody("createInvoiceAction")).toContain("recentMoneyRecordExists");
  });

  it("does not double-count fast duplicate payment submissions", () => {
    expect(actionBody("recordManualInvoicePaymentAction")).toContain("recordManualInvoicePayment");
    expect(lifecycleSource).toContain("on conflict (tenant_id,idempotency_key)");
    expect(lifecycleSource).toContain("invoice-payment:${input.tenantId}:${input.invoiceId}");
    expect(stripeWebhookSource).toContain("on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing");
    expect(stripeWebhookSource).toContain("from payment p");
  });

  it("keeps customer merge cleanup inside the verified audited transaction", () => {
    const body = actionBody("mergeDuplicateCustomerAction");
    expect(body).toContain("withPostgresTransaction");
    expect(body).toContain("for update of source, target");
    expect(body).toContain("if (eligible.rowCount !== 1)");
    expect(body).toContain("returning id");
    expect(body).toContain("if (mergeAudit.rowCount !== 1)");
    expect(body.indexOf("delete from public.customer_tag_assignments")).toBeGreaterThan(body.indexOf("if (mergeAudit.rowCount !== 1)"));
  });
});
