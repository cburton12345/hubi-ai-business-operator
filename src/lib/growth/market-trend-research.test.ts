import { describe, expect, it } from "vitest";
import { validateMarketTrendResearch } from "./market-trend-research";
describe("market trend evidence", () => {
  const sources = [{ url: "https://example.gov/report", title: "Official report" }];

  it("keeps only findings backed by a retrieved source", () => {
    const trends = validateMarketTrendResearch({ trends: [{
      title: "Demand changed", summary: "A current change supported by an official report.", businessImplication: "Measure qualified demand before changing the campaign.",
      industries: ["roofing"], services: [], geographies: [], channels: ["search"], evidenceQuality: "primary", confidenceScore: 95, expiresInDays: 30,
      sourceUrls: ["https://example.gov/report"]
    }] }, sources);
    expect(trends).toHaveLength(1);
    expect(trends[0].confidenceScore).toBe(90);
  });

  it("rejects uncited model claims", () => {
    const trends = validateMarketTrendResearch({ trends: [{
      title: "Unsupported claim", summary: "This source was never actually retrieved by the research tool.", businessImplication: "It must not affect a business decision.",
      industries: [], services: [], geographies: [], channels: [], evidenceQuality: "primary", confidenceScore: 90, expiresInDays: 30,
      sourceUrls: ["https://vendor.invalid/claim"]
    }] }, sources);
    expect(trends).toEqual([]);
  });

  it("caps vendor claims at hypothesis confidence", () => {
    const trends = validateMarketTrendResearch({ trends: [{
      title: "Vendor says conversion improved", summary: "A vendor published a current product-result claim.", businessImplication: "Treat it as a test hypothesis, not a budget decision.",
      industries: [], services: [], geographies: [], channels: ["messaging"], evidenceQuality: "vendor_claim", confidenceScore: 90, expiresInDays: 14,
      sourceUrls: ["https://example.gov/report"]
    }] }, sources);
    expect(trends[0].confidenceScore).toBe(40);
  });
});
