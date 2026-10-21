import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, getPreferencesMock, allowEventMock, sendPushMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  allowEventMock: vi.fn(),
  sendPushMock: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("@/lib/push/preferences", () => ({
  getPushNotificationPreferences: getPreferencesMock,
  pushPreferencesAllowEvent: allowEventMock,
}));
vi.mock("@/lib/push/send-workspace-push", () => ({
  sendWorkspacePushNotifications: sendPushMock,
}));

import { evaluateConnectorHeartbeatAlerts } from "./connector-heartbeats";

describe("evaluateConnectorHeartbeatAlerts", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    getPreferencesMock.mockReset();
    allowEventMock.mockReset();
    sendPushMock.mockReset();
  });

  it("pushes a preference-authorized alert when Ferocity Connect goes offline", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-1", id: "device-1" }] })
      .mockResolvedValueOnce({ rows: [{ metadata_json: {} }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    getPreferencesMock.mockResolvedValue({ enabled: true });
    allowEventMock.mockReturnValue(true);
    sendPushMock.mockResolvedValue({ ok: true, sent: 1, failed: 0, skipped: 0, subscriptionCount: 1, missing: [] });

    const result = await evaluateConnectorHeartbeatAlerts();

    expect(result).toEqual({ staleSmsDevices: 1, staleFacebookIdentities: 0 });
    expect(queryPostgresMock.mock.calls[0][0]).toContain("set status='offline'");
    expect(sendPushMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      eventType: "integration.ferocity_connect.offline",
      url: "/app/integrations/ferocity-connect",
    }));
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("set metadata_json=metadata_json"),
      expect.arrayContaining([
        "tenant-1",
        "ferocity-connect:device-1:offline",
        expect.stringContaining('"lastPushAt"'),
      ]),
    );
  });
});
