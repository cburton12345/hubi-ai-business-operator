import { describe, expect, it } from "vitest";
import { assessBacklink, domainFromUrl, normalizeWebUrl } from "./link-intelligence";

describe("link authority intelligence", () => {
  it("normalizes ordinary domains and removes fragments", () => {
    expect(normalizeWebUrl("www.example.com/resource#section")).toBe("https://www.example.com/resource");
    expect(domainFromUrl("https://www.Example.com/page")).toBe("example.com");
  });

  it("scores a relevant editorial link without inventing value", () => {
    const result = assessBacklink({
      sourceUrl: "https://association.org/resources",
      targetUrl: "https://contractor.com/guide",
      anchorText: "contractor planning guide",
      domainRating: 65,
      relevanceScore: 90
    });
    expect(result.riskLevel).toBe("low");
    expect(result.qualityScore).toBeGreaterThan(70);
    expect(result.evidence.some((item) => item.detail.includes("not a ranking guarantee"))).toBe(true);
  });

  it("flags same-domain and invalid link records", () => {
    const sameDomain = assessBacklink({
      sourceUrl: "https://example.com/blog",
      targetUrl: "https://example.com/service",
      relevanceScore: 80
    });
    expect(sameDomain.riskLevel).toBe("high");
    expect(sameDomain.riskFlags.map((flag) => flag.key)).toContain("same_domain");

    const invalid = assessBacklink({
      sourceUrl: "not a url with spaces",
      targetUrl: "https://example.com"
    });
    expect(invalid.riskFlags.map((flag) => flag.key)).toContain("invalid_url");
  });

  it("flags aggressive repeated-style commercial anchors", () => {
    const result = assessBacklink({
      sourceUrl: "http://weak.example.net/post",
      targetUrl: "https://contractor.com",
      anchorText: "best cheap roofer near me",
      domainRating: 5,
      relevanceScore: 15
    });
    expect(result.riskLevel).toBe("medium");
    expect(result.riskFlags.map((flag) => flag.key)).toEqual(
      expect.arrayContaining(["insecure_source", "low_relevance", "optimized_anchor", "very_low_dr"])
    );
  });
});
