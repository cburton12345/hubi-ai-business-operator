import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarProvider } from "./google-calendar";
import { MicrosoftCalendarProvider } from "./microsoft-calendar";

describe("native calendar providers", () => {
  it("normalizes Google incremental event changes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: "g1", etag: "v1", status: "confirmed", summary: "Estimate", start: { dateTime: "2026-08-01T10:00:00Z" }, end: { dateTime: "2026-08-01T11:00:00Z" } }],
      nextSyncToken: "next-google"
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await new GoogleCalendarProvider("token", fetchImpl).listChanges({ calendarId: "primary", windowStart: "2026-01-01T00:00:00Z", windowEnd: "2027-01-01T00:00:00Z" });
    expect(result.nextCursor).toBe("next-google");
    expect(result.events[0]).toMatchObject({ id: "g1", title: "Estimate", startsAt: "2026-08-01T10:00:00Z" });
  });

  it("requests a clean Google resync when a cursor expires", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Gone" } }), { status: 410 })) as unknown as typeof fetch;
    const result = await new GoogleCalendarProvider("token", fetchImpl).listChanges({ calendarId: "primary", cursor: "expired", windowStart: "2026-01-01T00:00:00Z", windowEnd: "2027-01-01T00:00:00Z" });
    expect(result.resetRequired).toBe(true);
  });

  it("normalizes Microsoft delta changes and preserves the opaque delta link", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      value: [{ id: "m1", changeKey: "v2", subject: "Service call", start: { dateTime: "2026-08-02T12:00:00" }, end: { dateTime: "2026-08-02T13:00:00" } }],
      "@odata.deltaLink": "https://graph.microsoft.com/delta?token=opaque"
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await new MicrosoftCalendarProvider("token", fetchImpl).listChanges({ calendarId: "calendar", windowStart: "2026-01-01T00:00:00Z", windowEnd: "2027-01-01T00:00:00Z" });
    expect(result.nextCursor).toContain("opaque");
    expect(result.events[0]).toMatchObject({ id: "m1", title: "Service call", startsAt: "2026-08-02T12:00:00Z" });
  });
});
