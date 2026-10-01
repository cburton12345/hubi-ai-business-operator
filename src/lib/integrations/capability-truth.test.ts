import { describe, expect, it } from "vitest";
import { providerApprovalIsBlocked } from "./capability-truth";

describe("provider approval truth", () => {
  it("lets persisted provider certification override a stale approval-blocked baseline", () => {
    expect(providerApprovalIsBlocked("x_ads", "awaiting_provider")).toBe(true);
    expect(providerApprovalIsBlocked("x_ads", "connected_unverified")).toBe(false);
    expect(providerApprovalIsBlocked("x_ads", "certified_limited")).toBe(false);
  });

  it("does not block providers whose baseline is not approval-gated", () => {
    expect(providerApprovalIsBlocked("google_ads", "setup_required")).toBe(false);
  });
});
