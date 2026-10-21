import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  raisePlatformAdminAlert: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/observability/platform-admin-alerts", () => ({
  raisePlatformAdminAlert: mocks.raisePlatformAdminAlert,
}));

import { scanFerocityCheckoutRecovery } from "@/lib/platform/checkout-recovery";

describe("Ferocity checkout recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("raises durable owner alerts without contacting checkout customers", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [
        { id: "req-paid", checkout_status: "provisioning", requested_plan: "operator", minutes_stalled: 22 },
        { id: "req-abandoned", checkout_status: "redirected", requested_plan: "growth", minutes_stalled: 91 },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await scanFerocityCheckoutRecovery();

    expect(result).toEqual({ checked: 2, stalledProvisioning: 1, failedOrStalledCheckout: 0, abandonedCheckout: 1 });
    expect(mocks.raisePlatformAdminAlert).toHaveBeenCalledTimes(2);
    expect(mocks.raisePlatformAdminAlert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: "paid_provisioning_stalled",
      severity: "critical",
      notify: true,
      metadata: expect.objectContaining({ automaticCustomerContact: false }),
    }));
    expect(mocks.raisePlatformAdminAlert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "checkout_abandoned",
      notify: false,
    }));
  });

  it("resolves old recovery alerts when no checkout remains stalled", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await scanFerocityCheckoutRecovery();

    expect(mocks.queryPostgres).toHaveBeenLastCalledWith(expect.stringContaining("status='resolved'"), [[]]);
    expect(mocks.raisePlatformAdminAlert).not.toHaveBeenCalled();
  });
});
