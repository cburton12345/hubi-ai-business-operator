import { describe, expect, it } from "vitest";
import { appendReviewLink, destinationKey, normalizeReviewUrl, reviewRequestPublicUrl } from "./review-destinations";

describe("review destination helpers", () => {
  it("accepts normal web destinations and strips fragments", () => {
    expect(normalizeReviewUrl("https://g.page/r/example/review#write")).toBe("https://g.page/r/example/review");
  });

  it("rejects unsafe or non-web destinations", () => {
    expect(normalizeReviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeReviewUrl("https://user:secret@example.com/review")).toBeNull();
  });

  it("builds stable destination keys", () => {
    expect(destinationKey("google_business_profile", "Main Location Reviews")).toBe("google_business_profile:main-location-reviews");
  });

  it("adds the neutral Ferocity review landing page once", () => {
    const url = reviewRequestPublicUrl("abc", "https://example.com");
    const first = appendReviewLink("Thank you.", url);
    expect(first).toContain("Share your honest feedback: https://example.com/review/abc");
    expect(appendReviewLink(first, url)).toBe(first);
  });
});
