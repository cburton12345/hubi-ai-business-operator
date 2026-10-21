import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Stripe subscription entitlement convergence", () => {
  const webhook = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/stripe/webhook/route.ts"),
    "utf8"
  );

  it("reconciles entitlements even when Stripe subscription metadata is unavailable", () => {
    expect(webhook).toContain("returning tenant_id, plan_key");
    expect(webhook).toContain("for (const row of reconciled.rows)");
    expect(webhook).toContain("billingStatus: mappedStatus");
  });

  it("fails the webhook retryably rather than acknowledging an unavailable subscription write", () => {
    expect(webhook).toContain('if (!reconciled) throw new Error("The Stripe subscription could not be reconciled.")');
    expect(webhook).toContain('return NextResponse.json({ ok: false, status: "processing_failed" }, { status: 500 })');
  });
});
