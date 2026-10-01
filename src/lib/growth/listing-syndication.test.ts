import { describe, expect, it } from "vitest";
import { buildListingSyndicationXml, isListingSyndicationProvider, listingReadinessIssues, matchesFeedToken, normalizeCanonicalListing, sha256Hex } from "./listing-syndication";

describe("listing syndication", () => {
  it("recognizes only the supported provider keys", () => {
    expect(isListingSyndicationProvider("zillow_network")).toBe(true);
    expect(isListingSyndicationProvider("apartments_feed")).toBe(true);
    expect(isListingSyndicationProvider("unknown")).toBe(false);
  });

  it("keeps the feed token hash-only and compares it safely", () => {
    const hash = sha256Hex("tenant-secret");
    expect(matchesFeedToken("tenant-secret", hash)).toBe(true);
    expect(matchesFeedToken("wrong", hash)).toBe(false);
  });

  it("extracts private provider fields and reports incomplete listings", () => {
    const listing = normalizeCanonicalListing({
      id: "listing-1", title: "Somerset", body: "Four bedroom home", updated_at: "2026-09-29T00:00:00Z",
      canonical_payload_json: {
        privateProviderFields: { street: "100 Main St", city: "Somerset", state: "WI", postalCode: "54025" },
        property: { rent: 2200, bedrooms: 4, bathrooms: 2 },
        callToAction: { url: "https://example.com/start" },
        media: [{ kind: "image", url: "https://example.com/house.jpg" }]
      }
    });
    expect(listingReadinessIssues(listing)).toEqual([]);
    expect(listing.street).toBe("100 Main St");
  });

  it("escapes XML and includes no skipped listing details", () => {
    const xml = buildListingSyndicationXml({ tenantId: "tenant", providerKey: "zillow_network", skippedCount: 1, listings: [{
      id: "1", title: "A & B", description: "<home>", street: "1 Main", city: "Town", state: "WI", postalCode: "54000",
      rent: 1000, photos: ["https://example.com/a?x=1&y=2"], listingUrl: "https://example.com/start"
    }] });
    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("&lt;home&gt;");
    expect(xml).toContain("<SkippedListingCount>1</SkippedListingCount>");
  });
});
