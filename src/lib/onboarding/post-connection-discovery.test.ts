import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, syncMailboxMock, discoverCalendarsMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  syncMailboxMock: vi.fn(),
  discoverCalendarsMock: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("@/lib/integrations/mailbox/sync", () => ({ syncMailbox: syncMailboxMock }));
vi.mock("@/lib/integrations/calendar/sync", () => ({ discoverProviderCalendars: discoverCalendarsMock }));

import { discoverConnectedProviderContext } from "./post-connection-discovery";

describe("discoverConnectedProviderContext", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset().mockResolvedValue({ rowCount: 1, rows: [] });
    syncMailboxMock.mockReset();
    discoverCalendarsMock.mockReset();
  });

  it("performs the first read-only mailbox discovery after OAuth", async () => {
    syncMailboxMock.mockResolvedValue({ provider: "gmail_mailbox", seen: 8, saved: 7 });
    const result = await discoverConnectedProviderContext({ tenantId: "tenant-1", provider: "gmail_mailbox" });
    expect(syncMailboxMock).toHaveBeenCalledWith({ tenantId: "tenant-1", provider: "gmail_mailbox", limit: 25 });
    expect(result).toMatchObject({ status: "completed", recordsDiscovered: 7 });
    expect(queryPostgresMock).toHaveBeenCalledWith(expect.stringContaining("integration_connections"), [
      "tenant-1",
      "gmail_mailbox",
      expect.stringContaining('"onboardingDiscoveryStatus":"completed"'),
    ]);
    expect(queryPostgresMock).toHaveBeenCalledWith(expect.stringContaining("ferocity_chat_action_receipts"), [
      "tenant-1",
      "gmail mailbox business discovery",
      expect.stringContaining("saved 7"),
      "completed",
      "/app/email-watch",
      "mailbox_messages",
      "gmail_mailbox",
      expect.stringContaining('"authoritativeRecordsRemainWithProvider":true'),
    ]);
  });

  it("discovers calendars but waits for the customer to choose the operating calendar", async () => {
    discoverCalendarsMock.mockResolvedValue([{ id: "primary", name: "Work", primary: true }]);
    const result = await discoverConnectedProviderContext({ tenantId: "tenant-1", provider: "google_calendar" });
    expect(result).toMatchObject({ status: "ready_for_selection", recordsDiscovered: 0 });
    expect(queryPostgresMock).toHaveBeenCalledWith(expect.stringContaining("integration_connections"), [
      "tenant-1",
      "google_calendar",
      expect.stringContaining('"calendarChoices"'),
    ]);
    expect(queryPostgresMock).toHaveBeenCalledWith(expect.stringContaining("ferocity_chat_action_receipts"), expect.arrayContaining([
      "tenant-1",
      "google calendar business discovery",
      expect.stringContaining("Select the operating calendar"),
      "needs_input",
      "/app/integrations/calendar?onboarding=1",
    ]));
  });

  it("keeps a successful connection when discovery needs a retry", async () => {
    syncMailboxMock.mockRejectedValue(new Error("Provider temporarily unavailable."));
    const result = await discoverConnectedProviderContext({ tenantId: "tenant-1", provider: "microsoft_mailbox" });
    expect(result).toEqual({ status: "failed", summary: "Provider temporarily unavailable.", recordsDiscovered: 0 });
  });
});
