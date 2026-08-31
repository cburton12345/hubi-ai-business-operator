import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
import { authenticateConnectDevice } from "./device-auth";

function request(nonce = "f5d4db96-82fd-48bd-a19b-3b734ee87e4a", timestamp = Math.floor(Date.now() / 1000)) {
  return new Request("https://ferocity.live/api/ferocity-connect/device/heartbeat", { headers: {
    Authorization: `Bearer fcd_${"a".repeat(43)}`,
    "X-Ferocity-Device-Nonce": nonce,
    "X-Ferocity-Device-Timestamp": String(timestamp)
  } });
}

describe("Ferocity Connect device authentication", () => {
  beforeEach(() => queryPostgresMock.mockReset());

  it("derives tenant identity from a valid server-side credential and records the nonce", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ credential_id: "credential", device_id: "device", tenant_id: "tenant", device_status: "active", sending_enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ credential_id: "credential" }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await authenticateConnectDevice(request());
    expect(result).toEqual({ ok: true, identity: { credentialId: "credential", deviceId: "device", tenantId: "tenant", deviceStatus: "active", sendingEnabled: true } });
    expect(queryPostgresMock.mock.calls[1][0]).toContain("ferocity_connect_request_nonces");
  });

  it("rejects replayed nonces", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ credential_id: "credential", device_id: "device", tenant_id: "tenant", device_status: "active", sending_enabled: true }] })
      .mockResolvedValueOnce({ rows: [] });
    expect(await authenticateConnectDevice(request())).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects stale requests before touching the database", async () => {
    expect(await authenticateConnectDevice(request(undefined, Math.floor(Date.now() / 1000) - 301))).toMatchObject({ ok: false, status: 401 });
    expect(queryPostgresMock).not.toHaveBeenCalled();
  });
});
