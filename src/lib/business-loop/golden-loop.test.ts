import { describe, expect, it } from "vitest";
import {
  GOLDEN_LOOP_STAGE_KEYS,
  emptyGoldenLoopSnapshot,
  evaluateGoldenLoop,
  failureDisposition,
  retryDelaySeconds
} from "@/lib/business-loop/golden-loop";

describe("golden business loop", () => {
  it("does not claim later work completed when an earlier handoff is missing", () => {
    const snapshot = emptyGoldenLoopSnapshot();
    snapshot.demand_source_recorded = { complete: true, sourceType: "lead" };
    snapshot.lead_captured = { complete: true, sourceType: "lead" };
    snapshot.estimate_prepared = { complete: true, sourceType: "service_estimate" };

    const result = evaluateGoldenLoop(snapshot);

    expect(result.currentStage).toBe("lead_qualified");
    expect(result.handoffGaps).toContain("estimate_prepared");
    expect(result.stages.find((stage) => stage.key === "estimate_prepared")?.status).toBe("blocked");
  });

  it("certifies the loop only when every stage has evidence", () => {
    const snapshot = emptyGoldenLoopSnapshot();
    for (const key of GOLDEN_LOOP_STAGE_KEYS) snapshot[key] = { complete: true, sourceId: key };

    const result = evaluateGoldenLoop(snapshot);

    expect(result.status).toBe("completed");
    expect(result.completedStages).toBe(GOLDEN_LOOP_STAGE_KEYS.length);
    expect(result.handoffGaps).toEqual([]);
  });

  it("uses bounded exponential retries and dead-letters exhausted work", () => {
    expect(retryDelaySeconds(1)).toBe(30);
    expect(retryDelaySeconds(20)).toBe(3600);
    expect(failureDisposition(4, 5)).toEqual({ status: "failed", retryAfterSeconds: 240 });
    expect(failureDisposition(5, 5)).toEqual({ status: "dead_lettered", retryAfterSeconds: null });
  });
});
