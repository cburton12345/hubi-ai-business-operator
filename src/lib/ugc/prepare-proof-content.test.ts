import { describe, expect, it } from "vitest";
import { proofContentBody } from "@/lib/ugc/prepare-proof-content";

const proof = {
  id: "proof-1",
  brand_id: "brand-1",
  title: "Roof replacement",
  customer_name: "Private Customer",
  service_type: "roof replacement",
  city: "Eau Claire",
  state: "WI",
  story_text: "The project was completed on schedule.",
  result_summary: "A completed roof.",
  rating: 5,
  permission_marketing: true,
  permission_use_name: false,
  permission_use_location: false
};

describe("proof content preparation", () => {
  it("does not expose a name or location when those permissions are absent", () => {
    const body = proofContentBody("ad_creative", proof);
    expect(body).not.toContain("Private Customer");
    expect(body).not.toContain("Eau Claire");
    expect(body).toContain("a customer");
  });

  it("uses approved attribution when explicit permissions exist", () => {
    const body = proofContentBody("facebook_post", {
      ...proof,
      permission_use_name: true,
      permission_use_location: true
    });
    expect(body).toContain("Eau Claire, WI");
  });
});
