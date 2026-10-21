import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));

import { retryFailedOutboundActionsForTenant } from "./scan-action-queue";

describe("retryFailedOutboundActionsForTenant", () => {
  beforeEach(() => queryPostgresMock.mockReset());

  it("uses bounded automatic retry only for transient failures under a live no-approval policy", async () => {
    queryPostgresMock.mockResolvedValue({ rows: [{ reopened: "2" }] });

    await expect(retryFailedOutboundActionsForTenant("tenant-1")).resolves.toBe(2);

    const [sql, values] = queryPostgresMock.mock.calls[0];
    expect(String(sql)).toContain("coalesce((q.metadata_json->>'retryable')::boolean, false)");
    expect(String(sql)).toContain("when candidate.automatic_retry then 'queued'");
    expect(String(sql)).toContain("coalesce((q.metadata_json->>'retryCount')::int, 0) < 2");
    expect(String(sql)).toContain("else 'needs_review'");
    expect(values).toEqual(["tenant-1"]);
  });
});
