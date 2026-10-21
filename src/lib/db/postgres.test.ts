import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = query;
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://test", DATABASE_CA_CERT_BASE64: "" },
}));

describe("queryPostgresRequired", () => {
  beforeEach(() => query.mockReset());

  it("returns successful query results", async () => {
    query.mockResolvedValue({ rows: [{ total: "4" }] });
    const { queryPostgresRequired } = await import("./postgres");

    await expect(queryPostgresRequired<{ total: string }>("select 4", [], "test-read"))
      .resolves.toEqual({ rows: [{ total: "4" }] });
  });

  it("throws a sanitized typed error instead of returning a false empty result", async () => {
    query.mockResolvedValue(null);
    const { queryPostgresRequired } = await import("./postgres");

    await expect(queryPostgresRequired("select 1", [], "owner-dashboard"))
      .rejects.toMatchObject({
        name: "RequiredPostgresQueryError",
        code: "DATABASE_QUERY_UNAVAILABLE",
        context: "owner-dashboard",
        message: "Required database query failed (owner-dashboard).",
      });
  });
});
