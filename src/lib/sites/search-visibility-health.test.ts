import { describe, expect, it } from "vitest";
import { evaluateSearchVisibility, robotsAllowsPath, sitemapCandidates } from "./search-visibility-health";

const healthyInput = {
  pageUrl: "https://example.com/",
  html: '<html><head><link rel="canonical" href="https://example.com/"><meta name="robots" content="index, follow"></head></html>',
  xRobotsTag: null,
  robotsUrl: "https://example.com/robots.txt",
  robotsStatus: 200,
  robotsText: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
  sitemapUrl: "https://example.com/sitemap.xml",
  sitemapStatus: 200,
  sitemapText: "<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>"
};

describe("search visibility health", () => {
  it("recognizes an indexable website with a self-canonical and public sitemap", () => {
    const result = evaluateSearchVisibility(healthyInput);
    expect(result.status).toBe("indexable");
    expect(result.score).toBe(100);
    expect(result.sitemapUrlCount).toBe(2);
    expect(result.checks.every((check) => check.status === "good")).toBe(true);
  });

  it("surfaces crawler and noindex blocks instead of treating a successful fetch as healthy", () => {
    const result = evaluateSearchVisibility({
      ...healthyInput,
      xRobotsTag: "noindex, nofollow",
      robotsText: "User-agent: *\nDisallow: /"
    });
    expect(result.status).toBe("blocked");
    expect(result.googlebotAllowed).toBe(false);
    expect(result.bingbotAllowed).toBe(false);
    expect(result.checks.filter((check) => check.status === "blocked").map((check) => check.key)).toEqual(["robots", "indexing"]);
  });

  it("honors a specific crawler group over the wildcard group", () => {
    const robots = "User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /";
    expect(robotsAllowsPath(robots, "Googlebot")).toBe(false);
    expect(robotsAllowsPath(robots, "Bingbot")).toBe(true);
  });

  it("reports missing sitemap and canonical as attention items, not a false indexing block", () => {
    const result = evaluateSearchVisibility({
      ...healthyInput,
      html: "<html><head><title>Example</title></head></html>",
      sitemapStatus: 404,
      sitemapText: null
    });
    expect(result.status).toBe("needs_attention");
    expect(result.score).toBe(70);
    expect(result.checks.filter((check) => check.status === "warning").map((check) => check.key)).toEqual(["sitemap", "canonical"]);
  });

  it("uses robots-declared sitemaps first and keeps the standard fallback", () => {
    expect(sitemapCandidates("Sitemap: /custom-map.xml", "https://example.com")).toEqual([
      "https://example.com/custom-map.xml",
      "https://example.com/sitemap.xml"
    ]);
  });
});
