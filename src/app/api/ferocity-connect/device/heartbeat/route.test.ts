import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/ferocity-connect/device-auth", () => ({ authenticateConnectDevice: mocks.authenticate }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/ferocity-connect/crypto", () => ({ maskPhoneNumber: () => null }));

import { POST } from "./route";

describe("Ferocity Connect heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      ok: true,
      identity: {
        deviceId: "device-1",
        tenantId: "tenant-1",
        deviceStatus: "offline",
        sendingEnabled: true,
      },
    });
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("restores an offline device to active when a valid heartbeat returns", async () => {
    const response = await POST(new Request("https://ferocity.live/api/ferocity-connect/device/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appVersion: "1.0", androidVersion: "14", sims: [] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("status in ('paired','offline')"),
      expect.arrayContaining(["device-1", "tenant-1"]),
    );
  });
});
