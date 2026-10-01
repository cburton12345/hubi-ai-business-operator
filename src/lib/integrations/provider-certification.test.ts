import { describe, expect, it } from "vitest";
import {
  canEnableProviderLiveActions,
  deriveProviderCertificationStatus,
  integrationStatusForCertification,
  laneStatusForCertification,
  providerAccountStatusForCertification
} from "./provider-certification";

describe("provider certification lifecycle", () => {
  it("maps provider and lane states without claiming live execution", () => {
    expect(integrationStatusForCertification("awaiting_provider")).toBe("planned");
    expect(providerAccountStatusForCertification("setup_required")).toBe("planned");
    expect(providerAccountStatusForCertification("awaiting_provider")).toBe("planned");
    expect(providerAccountStatusForCertification("connected_unverified")).toBe("connected");
    expect(laneStatusForCertification("awaiting_provider")).toBe("needs_attention");
    expect(integrationStatusForCertification("suspended")).toBe("paused");
    expect(providerAccountStatusForCertification("suspended")).toBe("paused");
    expect(laneStatusForCertification("suspended")).toBe("blocked");
  });

  it("requires certification, executable code, and credentials for live actions", () => {
    expect(canEnableProviderLiveActions({ certificationStatus: "connected_unverified", executableAdapter: true, credentialsReady: true }).allowed).toBe(false);
    expect(canEnableProviderLiveActions({ certificationStatus: "certified_live", executableAdapter: false, credentialsReady: true }).allowed).toBe(false);
    expect(canEnableProviderLiveActions({ certificationStatus: "certified_live", executableAdapter: true, credentialsReady: false }).allowed).toBe(false);
    expect(canEnableProviderLiveActions({ certificationStatus: "certified_live", executableAdapter: true, credentialsReady: true }).allowed).toBe(true);
  });

  it("preserves truthful historical state until an explicit certification is saved", () => {
    expect(deriveProviderCertificationStatus({ accountStatus: "connected", liveActionsEnabled: true })).toBe("certified_live");
    expect(deriveProviderCertificationStatus({ integrationStatus: "connected", liveActionsEnabled: false })).toBe("connected_unverified");
    expect(deriveProviderCertificationStatus({ accountStatus: "planned" })).toBe("awaiting_provider");
    expect(deriveProviderCertificationStatus({ integrationStatus: "not_connected" })).toBe("setup_required");
    expect(deriveProviderCertificationStatus({ explicitStatus: "certified_limited", accountStatus: "connected", liveActionsEnabled: true })).toBe("certified_limited");
  });
});
