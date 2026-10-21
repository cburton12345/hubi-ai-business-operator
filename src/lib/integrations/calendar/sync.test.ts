import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, createCalendarProviderMock, provider } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  createCalendarProviderMock: vi.fn(),
  provider: {
    listCalendars: vi.fn(),
    listChanges: vi.fn(),
    upsertEvent: vi.fn(),
    deleteEvent: vi.fn(),
  },
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("./provider", () => ({ createCalendarProvider: createCalendarProviderMock }));

import { runOutboundCalendarSync } from "./sync";

describe("calendar synchronization", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    createCalendarProviderMock.mockReset();
    provider.upsertEvent.mockReset();
    provider.deleteEvent.mockReset();
    createCalendarProviderMock.mockResolvedValue(provider);
  });

  it("writes a booked incoming-lead appointment to the connected calendar", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        connection_id: "connection-1",
        external_calendar_id: "primary",
        outbound_writes_enabled: true,
        sync_direction: "two_way",
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "appointment-1",
        appointment_type: "estimate",
        status: "booked",
        scheduled_start: "2026-10-10T17:00:00.000Z",
        scheduled_end: "2026-10-10T18:00:00.000Z",
        contact_name: "Jamie Customer",
        contact_email: "jamie@example.com",
        external_id: null,
        last_synced_hash: null,
      }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    provider.upsertEvent.mockResolvedValue({ id: "google-event-1", version: "v1" });

    const result = await runOutboundCalendarSync({
      tenantId: "tenant-1",
      providerKey: "google_calendar",
    });

    expect(result).toEqual({ written: 1, deleted: 0, skipped: 0 });
    expect(provider.upsertEvent).toHaveBeenCalledWith("primary", expect.objectContaining({
      title: "Jamie Customer — estimate",
      attendeeEmails: ["jamie@example.com"],
      idempotencyKey: "revenue-appointment:appointment-1",
    }));
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("'revenue_appointments'"),
      expect.arrayContaining(["appointment-1", "google-event-1"]),
    );
  });
});
