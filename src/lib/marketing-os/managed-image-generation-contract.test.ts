import { describe, expect, it } from "vitest";
import { managedImageAttemptIdentity, managedImageExecutionModeAllowsApprovedJob } from "@/lib/marketing-os/managed-image-generation";

describe("managed image execution contract", () => {
  it("permits individually approved work in review-required or explicitly enabled mode only", () => {
    expect(managedImageExecutionModeAllowsApprovedJob("review_required")).toBe(true);
    expect(managedImageExecutionModeAllowsApprovedJob("enabled")).toBe(true);
    expect(managedImageExecutionModeAllowsApprovedJob("draft_only")).toBe(false);
    expect(managedImageExecutionModeAllowsApprovedJob("off")).toBe(false);
  });

  it("creates a distinct immutable provider identity per attempt while preserving billing period", () => {
    const date = new Date("2026-10-22T20:00:00.000Z");
    const first = managedImageAttemptIdentity("job-1", "openai_image", date, "attempt-1");
    const retry = managedImageAttemptIdentity("job-1", "openai_image", date, "attempt-2");
    expect(first.billingPeriod).toBe("2026-10");
    expect(retry.billingPeriod).toBe(first.billingPeriod);
    expect(retry.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toContain("attempt-1");
    expect(retry.idempotencyKey).toContain("attempt-2");
  });
});
