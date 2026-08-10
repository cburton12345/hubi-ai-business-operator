import { describe, expect, it, vi } from "vitest";
import { listGa4Properties, listSearchConsoleSites, readGa4Daily, readSearchConsoleDaily } from "./google-reporting";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Google reporting adapters", () => {
  it("discovers tenant Search Console sites", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] }));
    const rows = await listSearchConsoleSites("token", fetchImpl as typeof fetch);
    expect(rows).toEqual([{ externalId: "sc-domain:example.com", displayName: "sc-domain:example.com", resourceType: "search_console_site", metadata: { permissionLevel: "siteOwner" } }]);
  });

  it("flattens GA4 account property summaries", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ accountSummaries: [{ account: "accounts/1", displayName: "Business", propertySummaries: [{ property: "properties/123", displayName: "Website" }] }] }));
    const rows = await listGa4Properties("token", fetchImpl as typeof fetch);
    expect(rows[0]).toMatchObject({ externalId: "properties/123", displayName: "Website", resourceType: "ga4_property" });
  });

  it("normalizes Search Console daily metrics", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: [{ keys: ["2026-08-01"], clicks: 4, impressions: 100, ctr: 0.04, position: 8.2 }] }));
    const rows = await readSearchConsoleDaily({ accessToken: "token", siteUrl: "sc-domain:example.com", startDate: "2026-08-01", endDate: "2026-08-01", fetchImpl: fetchImpl as typeof fetch });
    expect(rows[0]).toEqual({ date: "2026-08-01", metrics: { clicks: 4, impressions: 100, ctr: 0.04, averagePosition: 8.2 } });
  });

  it("normalizes GA4 daily metrics", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: [{ dimensionValues: [{ value: "20260801" }], metricValues: [{ value: "12" }, { value: "8" }, { value: "3" }, { value: "2" }] }] }));
    const rows = await readGa4Daily({ accessToken: "token", propertyId: "properties/123", startDate: "2026-08-01", endDate: "2026-08-01", fetchImpl: fetchImpl as typeof fetch });
    expect(rows[0]).toEqual({ date: "2026-08-01", metrics: { sessions: 12, users: 8, newUsers: 3, conversions: 2 } });
  });
});
