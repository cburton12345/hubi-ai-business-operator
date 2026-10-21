import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ withPostgresTransactionResult: transactionMock }));

import { applyPlanEntitlements, inheritedServiceFeaturesForPlan } from "./apply-plan-entitlements";


describe("plan entitlement inheritance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps core AI when a customer upgrades beyond Starter", () => {
    expect(inheritedServiceFeaturesForPlan("starter")).toContain("ai_generation");
    expect(inheritedServiceFeaturesForPlan("growth")).toContain("ai_generation");
    expect(inheritedServiceFeaturesForPlan("operator")).toContain("ai_generation");
  });

  it("does not add unrelated marketing tools to the Connect-only plan", () => {
    const features = inheritedServiceFeaturesForPlan("ferocity_connect");
    expect(features).toContain("ai_generation");
    expect(features).toContain("sms_send");
    expect(features).not.toContain("seo_autopilot");
  });

  it("updates tenant billing state and entitlements in one transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    await applyPlanEntitlements({ tenantId: "tenant-1", planKey: "operator", billingStatus: "active" });

    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[0][0])).toContain("update public.tenants");
    expect(String(query.mock.calls[1][0])).toContain("status='disabled'");
    expect(String(query.mock.calls[2][0])).toContain("insert into public.workspace_feature_entitlements");
  });

  it("disables provisioned entitlements and does not re-enable them after cancellation", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    transactionMock.mockImplementation(async (operation) => ({ ok: true, value: await operation({ query }) }));

    await applyPlanEntitlements({ tenantId: "tenant-1", planKey: "operator", billingStatus: "cancelled" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain("$3 = 'cancelled'");
  });

  it("fails closed when any entitlement reconciliation step rolls back", async () => {
    transactionMock.mockResolvedValue({ ok: false, error: new Error("database unavailable") });

    await expect(
      applyPlanEntitlements({ tenantId: "tenant-1", planKey: "operator", billingStatus: "active" })
    ).rejects.toThrow("could not reconcile the subscription and workspace entitlements atomically");
  });
});
