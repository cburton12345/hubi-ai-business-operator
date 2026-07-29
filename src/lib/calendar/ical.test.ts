import { describe, expect, it } from "vitest";
import { buildICalendar } from "./ical";

describe("iCalendar schedule export", () => {
  it("builds an RFC-style calendar without provider credentials", () => {
    const calendar = buildICalendar([{
      id: "11111111-1111-4111-8111-111111111111",
      title: "Roof inspection, north side",
      customerName: "Jane Customer",
      address: "12 Main St, Eau Claire, WI 54701",
      assignedWorkers: "Alex",
      scheduledStart: "2026-08-01T15:00:00.000Z",
      scheduledEnd: "2026-08-01T16:00:00.000Z",
      updatedAt: "2026-07-28T20:00:00.000Z",
      status: "scheduled"
    }]);

    expect(calendar).toContain("BEGIN:VCALENDAR\r\n");
    expect(calendar).toContain("UID:visit-11111111-1111-4111-8111-111111111111@ferocity.live");
    expect(calendar).toContain("DTSTART:20260801T150000Z");
    expect(calendar).toContain("SUMMARY:Roof inspection\\, north side");
    expect(calendar).toContain("END:VCALENDAR\r\n");
  });
});
