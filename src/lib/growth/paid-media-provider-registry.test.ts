import { describe, expect, it } from "vitest";
import { getPaidMediaProvider, paidMediaCapabilityKeys, paidMediaCapabilityMatrix, paidMediaConnectionCatalog, paidMediaCustomerAuthorization, paidMediaProviders } from "./paid-media-provider-registry";

describe("paid media provider registry", () => {
  it("covers the material networks without double-counting placements", () => {
    expect(Object.keys(paidMediaProviders)).toEqual(expect.arrayContaining([
      "meta_ads", "google_ads", "tiktok_ads", "microsoft_ads", "linkedin_ads", "x_ads",
      "reddit_ads", "pinterest_ads", "snapchat_ads", "amazon_ads", "openai_ads", "apple_search_ads"
    ]));
    expect(getPaidMediaProvider("meta_ads")?.placements).toContain("Instagram");
    expect(getPaidMediaProvider("google_ads")?.placements).toContain("YouTube");
    expect(getPaidMediaProvider("instagram_ads")).toBeNull();
    expect(getPaidMediaProvider("youtube_ads")).toBeNull();
  });

  it("declares every capability for every network", () => {
    for (const provider of Object.values(paidMediaProviders)) {
      expect(Object.keys(provider.capabilities).sort()).toEqual([...paidMediaCapabilityKeys].sort());
      expect(provider.officialDocs.length).toBeGreaterThan(0);
    }
  });

  it("does not claim current full-management certification", () => {
    expect(Object.values(paidMediaProviders).some((provider) => provider.ferocityState === "full_management")).toBe(false);
    expect(getPaidMediaProvider("tiktok_ads")?.ferocityState).toBe("waiting_for_platform_approval");
    expect(getPaidMediaProvider("openai_ads")?.capabilities.authorization.support).toBe("account_dependent");
  });

  it("keeps ad accounts separate from measurement and first-party truth", () => {
    expect(paidMediaConnectionCatalog.ad_accounts).toContain("google_ads");
    expect(paidMediaConnectionCatalog.analytics).toContain("google_analytics_4");
    expect(paidMediaConnectionCatalog.attribution_mmp).toContain("ferocity_closed_loop_attribution");
    expect(paidMediaConnectionCatalog.crm_first_party).toContain("ferocity_crm");
    expect(paidMediaConnectionCatalog.website_tracking).toContain("openai_pixel_capi");
  });

  it("returns a serializable capability matrix", () => {
    const matrix = paidMediaCapabilityMatrix();
    expect(matrix).toHaveLength(Object.keys(paidMediaProviders).length);
    expect(matrix.find((provider) => provider.key === "reddit_ads")?.capabilities.reporting).toBe("supported");
  });

  it("never asks ordinary customers to supply developer credentials", () => {
    for (const authorization of Object.values(paidMediaCustomerAuthorization)) {
      const customerAction = authorization.customerAction.toLowerCase();
      expect(customerAction).not.toContain("client secret");
      expect(customerAction).not.toContain("developer token");
      expect(customerAction).not.toContain("api key");
      expect(customerAction).not.toContain("create a developer");
    }
  });
});
