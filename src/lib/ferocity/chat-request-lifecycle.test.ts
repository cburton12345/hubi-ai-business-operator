import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres } = vi.hoisted(() => ({ queryPostgres: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

import { persistFerocityOwnerRequest, persistFerocityResponse } from "./chat-request-lifecycle";

describe("Ask Ferocity durable request lifecycle", () => {
  beforeEach(() => queryPostgres.mockReset());

  it("persists the owner request before work with a retry-safe client key", async () => {
    queryPostgres.mockResolvedValue({ rows: [{ id: "owner-message" }] });
    await expect(persistFerocityOwnerRequest({
      tenantId: "tenant",
      threadId: "thread",
      userId: "user",
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      body: "Handle this",
      detail: { inputMode: "text" },
    })).resolves.toBe("owner-message");
    const [sql, values] = queryPostgres.mock.calls[0];
    expect(sql).toContain("role='owner'");
    expect(sql).toContain("on conflict do nothing");
    expect(values[4]).toContain("clientRequestId");
  });

  it("persists the result separately and never relies on a client spinner as state", async () => {
    queryPostgres.mockResolvedValue({ rows: [{ id: "ferocity-message" }] });
    await expect(persistFerocityResponse({
      tenantId: "tenant",
      threadId: "thread",
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      body: "The provider failed.",
      status: "failed",
      detail: { blocked: ["Provider unavailable"] },
    })).resolves.toBe("ferocity-message");
    const [sql, values] = queryPostgres.mock.calls[0];
    expect(sql).toContain("role='ferocity'");
    expect(values[5]).toBe("failed");
  });
});
