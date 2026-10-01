import { describe, expect, it } from "vitest";
import { evaluateLocalPresence, localPresenceEventKey, recommendedLocalDestinations, reviewDecision } from "./engine";

describe("local presence engine", () => {
  it("finds missing and inconsistent profile facts without silently overwriting them", () => {
    const result = evaluateLocalPresence({
      canonical: { name: "Acme Roofing", primaryCategory: "Roofing Contractor", phone: "+17155550100", website: "https://acme.test", verified: true },
      provider: { name: "Acme Roofing", primaryCategory: "Roofing Contractor", phone: "+17155550999", verified: true, updatedAt: "2026-09-01T00:00:00Z" },
      now: new Date("2026-09-22T00:00:00Z")
    });
    expect(result.issues.some((issue) => issue.key === "missing:website" && issue.safeToAutoFix)).toBe(true);
    expect(result.issues.some((issue) => issue.key === "inconsistent:phone" && !issue.safeToAutoFix)).toBe(true);
    expect(result.healthScore).toBeLessThan(100);
  });

  it("requires explicit owner opt-in for automatic positive review replies", () => {
    expect(reviewDecision({ stars: 5, comment: "Excellent work on our roof", positiveReplyOptIn: false }).action).toBe("prepare_reply");
    expect(reviewDecision({ stars: 5, comment: "Excellent work on our roof", positiveReplyOptIn: true }).action).toBe("auto_reply_eligible");
    expect(reviewDecision({ stars: 2, comment: "They missed the appointment", positiveReplyOptIn: true }).action).toBe("service_recovery");
  });

  it("turns operational changes into stable provider-neutral local events", () => {
    expect(localPresenceEventKey("tenant", "job_completed", "service_jobs", "job")).toBe(localPresenceEventKey("tenant", "job_completed", "service_jobs", "job"));
    expect(recommendedLocalDestinations("hours_changed")).toContain("bing_places");
  });
});
