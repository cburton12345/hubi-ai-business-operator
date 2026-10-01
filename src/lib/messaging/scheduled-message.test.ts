import { describe, expect, it } from "vitest";
import { resolveScheduledMessageTime, scheduledTimeIsAllowed, zonedLocalToDate } from "./scheduled-message";

describe("scheduled messages", () => {
  it("converts a workspace-local time to UTC", () => {
    expect(zonedLocalToDate("2026-09-05T08:30", "America/Chicago")?.toISOString()).toBe("2026-09-05T13:30:00.000Z");
  });

  it("chooses Monday for next business morning on Friday", () => {
    const result = resolveScheduledMessageTime({
      mode: "next_business_morning",
      timeZone: "America/Chicago",
      now: new Date("2026-09-04T22:00:00.000Z")
    });
    expect(result?.toISOString()).toBe("2026-09-07T13:30:00.000Z");
  });

  it("rejects nonexistent DST wall-clock times and dates over a year away", () => {
    expect(zonedLocalToDate("2026-03-08T02:30", "America/Chicago")).toBeNull();
    expect(scheduledTimeIsAllowed(new Date("2028-01-01T00:00:00.000Z"), new Date("2026-09-05T00:00:00.000Z"))).toBe(false);
  });
});
