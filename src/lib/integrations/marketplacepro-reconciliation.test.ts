import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgresRequired: vi.fn() }));

import { classifyMarketplaceProReconciliation } from "./marketplacepro-reconciliation";

const base = {
  ferocityStatus: "sourcing",
  contractorConfirmed: false,
  serviceJobId: null,
  serviceJobStatus: null,
  matchStatus: null,
  confirmationStatus: null,
  assignmentStatus: null,
  latestSyncStatus: "logged",
  latestSyncError: null
};

describe("MarketplacePro reconciliation", () => {
  it("keeps sourcing non-binding while waiting", () => {
    expect(classifyMarketplaceProReconciliation({ ...base, matchStatus: "qualified_matches_found" }))
      .toEqual({ state: "waiting", reasons: ["Sourcing is active; no binding assignment is inferred."] });
  });

  it("flags completion disagreement in either direction", () => {
    expect(classifyMarketplaceProReconciliation({
      ...base,
      ferocityStatus: "closed",
      serviceJobId: "job-1",
      serviceJobStatus: "completed",
      assignmentStatus: "dispatched"
    }).reasons).toContain("Ferocity reports completion but MarketplacePro has not reported a completed or verified assignment.");
    expect(classifyMarketplaceProReconciliation({
      ...base,
      serviceJobId: "job-1",
      serviceJobStatus: "in_progress",
      assignmentStatus: "verified"
    }).reasons).toContain("MarketplacePro reports completion but Ferocity has not completed the linked job.");
  });

  it("never treats provider progress without a Ferocity job as aligned", () => {
    expect(classifyMarketplaceProReconciliation({ ...base, assignmentStatus: "dispatched" }))
      .toMatchObject({ state: "attention" });
  });

  it("reports aligned evidence only when both systems agree", () => {
    expect(classifyMarketplaceProReconciliation({
      ...base,
      ferocityStatus: "closed",
      contractorConfirmed: true,
      confirmationStatus: "confirmed",
      serviceJobId: "job-1",
      serviceJobStatus: "completed",
      assignmentStatus: "verified"
    })).toEqual({ state: "aligned", reasons: ["MarketplacePro and Ferocity completion evidence agree."] });
  });
});
