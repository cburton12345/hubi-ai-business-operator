import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  raisePlatformAdminAlert: vi.fn(),
  resolvePlatformAdminAlert: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/observability/platform-admin-alerts", () => ({
  raisePlatformAdminAlert: mocks.raisePlatformAdminAlert,
  resolvePlatformAdminAlert: mocks.resolvePlatformAdminAlert
}));

import { sendPlatformAdminDailyBrief } from "./platform-admin-daily-brief";

describe("platform admin daily brief", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not send the same dated brief twice", async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

    await expect(sendPlatformAdminDailyBrief(new Date("2026-08-31T12:00:00.000Z"))).resolves.toEqual({
      sent: false,
      reason: "already_sent",
      dateKey: "2026-08-31"
    });
    expect(mocks.raisePlatformAdminAlert).not.toHaveBeenCalled();
  });

  it("summarizes customer, support, automation, provider, alert, and cost health", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        new_subscriptions: "2",
        cancellations: "1",
        onboarding_errors: "3",
        unresolved_support: "4",
        failed_automations: "1",
        provider_risks: "2",
        active_critical_alerts: "1",
        month_provider_cost_cents: "12345"
      }] });

    const result = await sendPlatformAdminDailyBrief(new Date("2026-08-31T12:00:00.000Z"));

    expect(result).toMatchObject({ sent: true, newSubscriptions: 2, unresolvedSupport: 4, monthProviderCostCents: 12345 });
    expect(mocks.raisePlatformAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
      fingerprint: "platform-daily-brief:2026-08-31",
      severity: "high",
      actionUrl: "/app/platform-activity"
    }));
    expect(mocks.resolvePlatformAdminAlert).toHaveBeenCalledWith("platform-daily-brief:2026-08-31");
  });
});
