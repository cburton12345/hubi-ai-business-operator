import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  getFreshProviderAccessToken: vi.fn(),
  fetchRecent: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/integrations/provider-access-token", () => ({
  getFreshProviderAccessToken: mocks.getFreshProviderAccessToken
}));
vi.mock("./gmail", () => ({ gmailMailboxAdapter: { fetchRecent: mocks.fetchRecent } }));
vi.mock("./microsoft", () => ({ microsoftMailboxAdapter: { fetchRecent: mocks.fetchRecent } }));

import { MailboxSyncInProgressError, syncMailbox } from "./sync";

const connection = {
  id: "connection-1",
  provider_key: "microsoft_mailbox",
  sync_cursor: null,
  read_enabled: true
};

describe("mailbox synchronization safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshProviderAccessToken.mockResolvedValue("access-token");
    mocks.fetchRecent.mockResolvedValue({ messages: [], nextCursor: null });
  });

  it("atomically refuses an overlapping synchronization", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [connection], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(syncMailbox({ tenantId: "tenant-1", provider: "microsoft_mailbox" }))
      .rejects.toBeInstanceOf(MailboxSyncInProgressError);
    expect(mocks.getFreshProviderAccessToken).not.toHaveBeenCalled();
  });

  it("claims a stale connection and completes an audited synchronization", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [connection], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [connection], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "run-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(syncMailbox({ tenantId: "tenant-1", provider: "microsoft_mailbox" }))
      .resolves.toEqual({ provider: "microsoft_mailbox", seen: 0, saved: 0 });

    expect(mocks.queryPostgres.mock.calls[1]?.[0]).toContain("status='syncing'");
    expect(mocks.queryPostgres.mock.calls[2]?.[0]).toContain("safely retried");
    expect(mocks.fetchRecent).toHaveBeenCalledOnce();
  });

  it("restores needs-attention status when an audit run cannot start", async () => {
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [connection], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [connection], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(syncMailbox({ tenantId: "tenant-1", provider: "microsoft_mailbox" }))
      .rejects.toThrow("could not start");
    expect(mocks.queryPostgres.mock.calls[4]?.[0]).toContain("status='needs_attention'");
  });
});
