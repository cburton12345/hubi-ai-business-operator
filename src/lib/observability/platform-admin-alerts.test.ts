import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  sendFerocityNotificationEmail: vi.fn(),
  sendWorkspacePushNotifications: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/email/transactional", () => ({
  sendFerocityNotificationEmail: mocks.sendFerocityNotificationEmail,
}));
vi.mock("@/lib/push/send-workspace-push", () => ({
  sendWorkspacePushNotifications: mocks.sendWorkspacePushNotifications,
}));

import { raisePlatformAdminAlert } from "./platform-admin-alerts";

describe("platform admin alert identity", () => {
  beforeEach(() => {
    mocks.queryPostgres.mockReset();
    mocks.sendFerocityNotificationEmail.mockReset();
    mocks.sendWorkspacePushNotifications.mockReset();
  });

  it("refreshes the alert family and type when a stable fingerprint changes condition", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [{ severity: "warning", last_notified_at: null }] })
      .mockResolvedValueOnce({ rows: [] });

    await raisePlatformAdminAlert({
      fingerprint: "operational-health:tenant-1",
      family: "automation_health",
      type: "operational_health_degraded",
      severity: "warning",
      title: "Ferocity execution needs attention",
      body: "Recent agent runs failed.",
      tenantId: "tenant-1",
      notify: false,
    });

    const upsertSql = String(mocks.queryPostgres.mock.calls[1]?.[0] ?? "");
    expect(upsertSql).toContain("alert_family=excluded.alert_family");
    expect(upsertSql).toContain("alert_type=excluded.alert_type");
    expect(mocks.sendFerocityNotificationEmail).not.toHaveBeenCalled();
    expect(mocks.sendWorkspacePushNotifications).not.toHaveBeenCalled();
  });
});
