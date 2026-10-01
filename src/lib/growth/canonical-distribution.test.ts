import { describe, expect, it } from "vitest";
import { adaptPublicationForDestination, buildDistributionPlan, distributionIdempotencyKey, nextDistributionRetry, type CanonicalPublication } from "./canonical-distribution";

const publication: CanonicalPublication = {
  id: "3466f232-b8af-4c25-942e-c45b3a17b7e9",
  type: "promotion",
  title: "Spring roof inspection",
  body: "Book a spring roof inspection before storm season.",
  callToAction: { label: "Book now", url: "https://example.com/book" },
  campaignKey: "spring-roof",
  approvalMode: "approval_required"
};

describe("canonical distribution engine", () => {
  it("adapts one publication into destination-specific tracked payloads", () => {
    const [facebook, email] = buildDistributionPlan({
      publication,
      destinationKeys: ["facebook", "email"],
      readiness: {
        facebook: { connected: true, liveActionsEnabled: false },
        email: { connected: true, liveActionsEnabled: true }
      }
    });
    expect(facebook.providerKey).toBe("facebook");
    expect(facebook.status).toBe("needs_human");
    expect(facebook.preview.callToAction).toContain("utm_source=facebook");
    expect(email.status).toBe("ready");
    expect(email.preview.callToAction).toContain("utm_medium=email");
  });

  it("does not pretend unsupported combinations can publish", () => {
    const result = adaptPublicationForDestination({ publication: { ...publication, type: "job_post" }, destinationKey: "sms" });
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("does not support");
  });

  it("keeps paid spend blocked until budget and explicit approval exist", () => {
    const paid = { ...publication, type: "paid_ad" as const };
    expect(adaptPublicationForDestination({ publication: paid, destinationKey: "google_ads", readiness: { connected: true, liveActionsEnabled: true } }).status).toBe("needs_approval");
    expect(adaptPublicationForDestination({ publication: { ...paid, budget: { totalCents: 5000, currency: "USD" } }, destinationKey: "google_ads", readiness: { connected: true, liveActionsEnabled: true }, explicitSpendApproved: true }).status).toBe("ready");
  });

  it("does not treat TikTok login as content or ad authorization", () => {
    const content = adaptPublicationForDestination({ publication, destinationKey: "tiktok", readiness: { connected: false, liveActionsEnabled: false } });
    const paid = adaptPublicationForDestination({ publication: { ...publication, type: "paid_ad", budget: { totalCents: 1000, currency: "USD" } }, destinationKey: "tiktok_ads", readiness: { connected: false, liveActionsEnabled: false }, explicitSpendApproved: true });
    expect(content.providerKey).toBe("tiktok_content");
    expect(paid.providerKey).toBe("tiktok_business");
    expect(content.status).not.toBe("ready");
    expect(paid.status).not.toBe("ready");
  });

  it("represents the major paid networks without pretending pending adapters are live", () => {
    const paid = { ...publication, type: "paid_ad" as const, budget: { totalCents: 5000, currency: "USD" } };
    for (const destinationKey of ["linkedin_ads", "x_ads", "reddit_ads", "pinterest_ads", "snapchat_ads", "amazon_ads", "openai_ads", "apple_search_ads"]) {
      const result = adaptPublicationForDestination({
        publication: paid,
        destinationKey,
        readiness: { connected: false, liveActionsEnabled: false },
        explicitSpendApproved: true
      });
      expect(result.status).toBe("needs_human");
      expect(result.method).toBe("manual");
    }
  });

  it("uses tenant feeds for rental listings but keeps live publication gated", () => {
    const listing: CanonicalPublication = {
      ...publication,
      type: "listing",
      title: "Four-bedroom rental",
      body: "Available rental prepared for owner review."
    };
    const result = adaptPublicationForDestination({
      publication: listing,
      destinationKey: "zillow_network",
      readiness: { connected: true, liveActionsEnabled: false, credentialsStatus: "configured" }
    });
    expect(result.method).toBe("feed");
    expect(result.status).toBe("needs_approval");
    expect(result.preview.warnings.join(" ")).toContain("provider approval");
  });

  it("creates stable idempotency keys and bounded retry times", () => {
    expect(distributionIdempotencyKey(publication, "facebook")).toBe(distributionIdempotencyKey(publication, "facebook"));
    expect(distributionIdempotencyKey(publication, "facebook")).not.toBe(distributionIdempotencyKey(publication, "email"));
    expect(nextDistributionRetry(99, new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-01T21:20:00.000Z");
  });
});
