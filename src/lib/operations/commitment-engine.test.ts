import { describe, expect, it } from "vitest";
import {
  commitmentState,
  normalizeCommitmentCandidate,
} from "./commitment-engine";

describe("operating commitment follow-through", () => {
  it("keeps unstructured action items review-first", () => {
    expect(
      normalizeCommitmentCandidate("Call the customer tomorrow"),
    ).toMatchObject({
      dueAt: null,
      responsibleType: "unassigned",
      confidenceScore: 50,
    });
  });

  it("accepts structured, evidence-aware commitments", () => {
    expect(
      normalizeCommitmentCandidate({
        commitment: "Send the revised estimate",
        dueAt: "2026-09-22T17:00:00Z",
        responsibleType: "employee",
        owner: "Estimator",
        outcome: "Customer receives revision",
        confidence: 88,
        evidenceRequired: true,
      }),
    ).toMatchObject({
      description: "Send the revised estimate",
      responsibleType: "employee",
      responsibleLabel: "Estimator",
      confidenceScore: 88,
      completionEvidenceRequired: true,
    });
  });

  it("moves active commitments through due-soon and overdue states deterministically", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(
      commitmentState({ status: "active", dueAt: "2026-09-22T10:00:00Z", now }),
    ).toBe("due_soon");
    expect(
      commitmentState({ status: "active", dueAt: "2026-09-21T10:00:00Z", now }),
    ).toBe("overdue");
    expect(
      commitmentState({
        status: "completed",
        dueAt: "2026-09-20T10:00:00Z",
        now,
      }),
    ).toBe("completed");
  });
});
