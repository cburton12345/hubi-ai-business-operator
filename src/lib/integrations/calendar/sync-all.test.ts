import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, inboundMock, outboundMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  inboundMock: vi.fn(),
  outboundMock: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("./sync", () => ({
  runInboundCalendarSync: inboundMock,
  runOutboundCalendarSync: outboundMock,
}));

import { syncDueCalendars } from "./sync-all";

describe("syncDueCalendars", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    inboundMock.mockReset();
    outboundMock.mockReset();
  });

  it("syncs due calendars in the background and isolates one provider failure", async () => {
    queryPostgresMock.mockResolvedValue({ rows: [
      { tenant_id: "tenant-1", provider_key: "google_calendar" },
      { tenant_id: "tenant-2", provider_key: "microsoft_calendar" },
    ] });
    inboundMock
      .mockResolvedValueOnce({ imported: 2, cancelled: 0, conflicts: 1, resetRequired: false })
      .mockRejectedValueOnce(new Error("Microsoft consent expired."));
    outboundMock.mockResolvedValueOnce({ written: 1, deleted: 0, skipped: 2 });

    const result = await syncDueCalendars({ concurrency: 1 });

    expect(result).toMatchObject({ checked: 2, synced: 1 });
    expect(result.results[0]).toMatchObject({ tenantId: "tenant-1", imported: 2, written: 1 });
    expect(result.failures).toEqual([{ tenantId: "tenant-2", provider: "microsoft_calendar", message: "Microsoft consent expired." }]);
  });
});
