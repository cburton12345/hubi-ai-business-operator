import { describe, expect, it } from "vitest";
import {
  assertCapabilityActionTransition,
  authorizeCapabilityExecution,
  evaluateCapabilityReadiness,
  evaluateFallback,
  nextCircuitState,
  recommendTrustChange
} from "./capability-trust";

const healthy = evaluateCapabilityReadiness([{ dependencyType: "provider", dependencyKey: "email", required: true, health: "healthy" }]);

describe("capability readiness and authorization", () => {
  it("blocks when a required dependency is unhealthy", () => {
    const readiness = evaluateCapabilityReadiness([{ dependencyType: "provider", dependencyKey: "sms", required: true, health: "suspended", reason: "Provider suspended" }]);
    expect(readiness).toMatchObject({ ready: false, health: "suspended" });
    expect(authorizeCapabilityExecution({ trustLevel: "autonomous", readiness, humanApproved: true, policyAllowsAutomatic: true, consequential: false }).allowed).toBe(false);
  });

  it("surfaces verification-required rather than treating connection as healthy", () => {
    const readiness = evaluateCapabilityReadiness([{ dependencyType: "integration", dependencyKey: "calendar", required: true, health: "verification_required", reason: "Token expired" }]);
    expect(readiness).toMatchObject({ ready: false, health: "verification_required" });
  });

  it("keeps an unmodeled capability unknown instead of assuming readiness", () => {
    expect(evaluateCapabilityReadiness([])).toEqual({ ready: false, health: "unknown", blockers: [], warnings: [] });
  });

  it("keeps observing read-only and assisted approval-bound", () => {
    expect(authorizeCapabilityExecution({ trustLevel: "observing", readiness: healthy, humanApproved: true, policyAllowsAutomatic: true, consequential: false }).allowed).toBe(false);
    expect(authorizeCapabilityExecution({ trustLevel: "assisted", readiness: healthy, humanApproved: false, policyAllowsAutomatic: true, consequential: false }).allowed).toBe(false);
    expect(authorizeCapabilityExecution({ trustLevel: "assisted", readiness: healthy, humanApproved: true, policyAllowsAutomatic: false, consequential: false }).allowed).toBe(true);
  });

  it("fails closed for consequential actions without explicit approval", () => {
    expect(authorizeCapabilityExecution({ trustLevel: "autonomous", readiness: healthy, humanApproved: false, policyAllowsAutomatic: true, consequential: true }).allowed).toBe(false);
  });
});

describe("truthful execution states", () => {
  it("does not equate provider acceptance with delivery", () => {
    expect(assertCapabilityActionTransition({ from: "attempted", to: "provider_accepted", providerEvidence: true }).allowed).toBe(true);
    expect(assertCapabilityActionTransition({ from: "attempted", to: "delivered", providerEvidence: false }).allowed).toBe(false);
  });

  it("requires outcome evidence when confirmation is required", () => {
    expect(assertCapabilityActionTransition({ from: "provider_accepted", to: "completed", providerEvidence: true, confirmationRequired: true }).allowed).toBe(false);
    expect(assertCapabilityActionTransition({ from: "confirmed", to: "completed", completionEvidence: true, confirmationRequired: true }).allowed).toBe(true);
  });

  it("permits explicit retry from a failed state", () => {
    expect(assertCapabilityActionTransition({ from: "failed", to: "queued" }).allowed).toBe(true);
  });

  it("accepts late provider evidence that corrects an earlier failure", () => {
    expect(assertCapabilityActionTransition({ from: "failed", to: "delivered", providerEvidence: true }).allowed).toBe(true);
  });
});

describe("fallbacks, circuits, and progressive trust", () => {
  it("allows a healthy authorized alternate only for retryable provider failures", () => {
    const base = { alternateConfigured: true, alternateAuthorized: true, alternateHealthy: true, consentStillValid: true };
    expect(evaluateFallback({ ...base, reason: "provider_outage" }).allowed).toBe(true);
    expect(evaluateFallback({ ...base, reason: "consent" }).allowed).toBe(false);
    expect(evaluateFallback({ ...base, reason: "account_suspended" }).allowed).toBe(false);
  });

  it("opens and safely probes a circuit breaker", () => {
    expect(nextCircuitState({ state: "closed", event: "failure", consecutiveFailures: 2, failureThreshold: 3 }).state).toBe("open");
    expect(nextCircuitState({ state: "open", event: "probe_due", consecutiveFailures: 3, failureThreshold: 3 })).toEqual({ state: "half_open", allowProbe: true });
    expect(nextCircuitState({ state: "half_open", event: "success", consecutiveFailures: 3, failureThreshold: 3 }).state).toBe("closed");
  });

  it("recommends promotion but never applies it automatically", () => {
    expect(recommendTrustChange({ current: "assisted", health: "healthy", verifiedSuccesses: 20, failures: 0, meaningfulCorrections: 0 })).toEqual({ direction: "promote", recommendedLevel: "trusted", automatic: false });
  });

  it("automatically recommends regression after health or correction failures", () => {
    expect(recommendTrustChange({ current: "autonomous", health: "degraded", verifiedSuccesses: 20, failures: 0, meaningfulCorrections: 0 })).toEqual({ direction: "regress", recommendedLevel: "assisted", automatic: true });
    expect(recommendTrustChange({ current: "trusted", health: "healthy", verifiedSuccesses: 9, failures: 1, meaningfulCorrections: 2 }).direction).toBe("regress");
  });
});
