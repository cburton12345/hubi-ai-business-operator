import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  syncMailbox: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("./sync", async () => {
  class MailboxSyncInProgressError extends Error {}
  return { MailboxSyncInProgressError, syncMailbox: mocks.syncMailbox };
});

import { MailboxSyncInProgressError } from "./sync";
import { syncDueMailboxes } from "./sync-all";

describe("due mailbox synchronization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes abandoned syncing connections in the due query", async () => {
    mocks.queryPostgres.mockResolvedValue({ rows: [], rowCount: 0 });
    await syncDueMailboxes();
    expect(mocks.queryPostgres.mock.calls[0]?.[0]).toContain("status='syncing'");
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual([100, "20 minutes"]);
  });

  it("treats a concurrent claim as a safe skip instead of a failure", async () => {
    mocks.queryPostgres.mockResolvedValue({
      rows: [{ tenant_id: "tenant-1", provider_key: "microsoft_mailbox" }],
      rowCount: 1
    });
    mocks.syncMailbox.mockRejectedValue(new MailboxSyncInProgressError());

    await expect(syncDueMailboxes()).resolves.toEqual({
      checked: 1,
      synced: 0,
      messagesSeen: 0,
      failures: []
    });
  });
});
