import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));

import { consumeGlobalRateLimit, consumeIdentifierRateLimit } from "./rate-limit";

describe("durable public rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryPostgres.mockResolvedValue({ rows: [{ request_count: 1 }] });
  });

  it("hashes normalized identifiers instead of persisting raw addresses", async () => {
    const result = await consumeIdentifierRateLimit({
      scope: "access_request_email_day",
      identifier: " Owner@Example.com ",
      limit: 2,
      windowSeconds: 86_400
    });

    expect(result.allowed).toBe(true);
    const parameters = mocks.queryPostgres.mock.calls[0][1] as unknown[];
    expect(parameters[0]).toBe("access_request_email_day");
    expect(parameters[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(parameters[1]).not.toContain("owner@example.com");
    expect(parameters[2]).toBe(86_400);
  });

  it("fails closed for an empty identifier", async () => {
    const result = await consumeIdentifierRateLimit({
      scope: "access_request_payload_day",
      identifier: "   ",
      limit: 4,
      windowSeconds: 86_400
    });

    expect(result).toEqual({ allowed: false, count: 5, limit: 4 });
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });

  it("uses one stable bucket for a global scope", async () => {
    await consumeGlobalRateLimit({
      scope: "access_request_global_day",
      limit: 20,
      windowSeconds: 86_400
    });
    await consumeGlobalRateLimit({
      scope: "access_request_global_day",
      limit: 20,
      windowSeconds: 86_400
    });

    const first = mocks.queryPostgres.mock.calls[0][1] as unknown[];
    const second = mocks.queryPostgres.mock.calls[1][1] as unknown[];
    expect(first[1]).toBe(second[1]);
    expect(first[1]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a bucket after its durable counter exceeds the limit", async () => {
    mocks.queryPostgres.mockResolvedValue({ rows: [{ request_count: 21 }] });

    const result = await consumeGlobalRateLimit({
      scope: "access_request_global_day",
      limit: 20,
      windowSeconds: 86_400
    });

    expect(result).toEqual({ allowed: false, count: 21, limit: 20 });
  });
});
