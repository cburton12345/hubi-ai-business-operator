import { describe, expect, it, vi } from "vitest";
import { listBusinessProfileLocations, listBusinessProfileReviews } from "./client";

describe("Google Business Profile read adapter", () => {
  it("normalizes locations without exposing provider records to business logic", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ locations: [{
      name: "locations/9", title: "Acme Roofing", phoneNumbers: { primaryPhone: "+17155550100" },
      storefrontAddress: { addressLines: ["1 Main St"], locality: "Eau Claire", administrativeArea: "WI", postalCode: "54701" },
      categories: { primaryCategory: { displayName: "Roofing contractor" } }, metadata: { hasVoiceOfMerchant: true }
    }] }), { status: 200 }));
    const rows = await listBusinessProfileLocations("accounts/7", "token", fetchImpl);
    expect(rows[0]).toMatchObject({ accountName: "accounts/7", name: "locations/9", title: "Acme Roofing", verificationState: "verified" });
    expect(rows[0].addressText).toContain("Eau Claire WI 54701");
  });

  it("normalizes reviews as a read model", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reviews: [{
      name: "accounts/7/locations/9/reviews/r1", reviewer: { displayName: "Jamie" }, starRating: "FIVE", comment: "Great work"
    }] }), { status: 200 }));
    const rows = await listBusinessProfileReviews("accounts/7", "locations/9", "token", fetchImpl);
    expect(rows[0]).toMatchObject({ reviewerName: "Jamie", starRating: 5, comment: "Great work" });
  });
});
