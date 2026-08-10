import { describe, expect, it, vi } from "vitest";
import { JOBBER_GRAPHQL_VERSION, queryJobberGraphQL } from "./client";

describe("Jobber GraphQL client", () => {
  it("sends the required version and bearer headers and reports query cost", async () => {
    let options: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      options = init;
      return new Response(JSON.stringify({
        data: { account: { id: "1" } },
        extensions: { cost: { requestedQueryCost: 4, actualQueryCost: 2, throttleStatus: { currentlyAvailable: 9998, restoreRate: 500 } }, versioning: { version: JOBBER_GRAPHQL_VERSION } }
      }), { status: 200 });
    }) as typeof fetch;
    const result = await queryJobberGraphQL<{ account: { id: string } }>({ accessToken: "token", query: "{ account { id } }", fetchImpl });
    expect((options?.headers as Record<string, string>)["x-jobber-graphql-version"]).toBe(JOBBER_GRAPHQL_VERSION);
    expect((options?.headers as Record<string, string>).authorization).toBe("Bearer token");
    expect(result.cost.actual).toBe(2);
  });

  it("turns throttling into a safe retryable message", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }), { status: 200 })) as typeof fetch;
    await expect(queryJobberGraphQL({ accessToken: "token", query: "{ account { id } }", fetchImpl })).rejects.toThrow("retry safely");
  });
});
