import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/app/service/actions.ts"), "utf8");
const stripeWebhookSource = readFileSync(join(process.cwd(), "src/app/api/integrations/stripe/webhook/route.ts"), "utf8");

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
    expect(actionBody("recordManualInvoicePaymentAction")).toContain("on conflict (tenant_id,idempotency_key)");
    expect(stripeWebhookSource).toContain("on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing");
    expect(stripeWebhookSource).toContain("from payment p");
  });
});
