import { describe, expect, it } from "vitest";
import {
  evaluateOperatingGoal,
  type OperatingGoalDependency,
  type OperatingGoalWorkState,
} from "./goal-engine";

const noWork: OperatingGoalWorkState = {
  commitmentsOpen: 0,
  commitmentsCompleted: 0,
  assignmentsOpen: 0,
  assignmentsCompleted: 0,
  serviceTasksOpen: 0,
  serviceTasksCompleted: 0,
  outboundActionsOpen: 0,
  outboundActionsCompleted: 0,
  outboundActionsFailed: 0,
};

function dependency(
  overrides: Partial<OperatingGoalDependency> = {},
): OperatingGoalDependency {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    dependencyType: "external_event",
    title: "Payment arrives",
    status: "waiting",
    required: true,
    ownerActionRequired: false,
    nextCheckAt: "2026-10-09T12:00:00.000Z",
    expectedBy: null,
    ...overrides,
  };
}

describe("persistent operating goal evaluation", () => {
  it("waits durably for an external event and schedules a future check", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "active",
      priority: "normal",
      dependencies: [dependency()],
      work: noWork,
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("waiting");
    expect(evaluation.nextEvaluationAt).toBe("2026-10-08T12:00:00.000Z");
    expect(evaluation.ownerAttention).toBe(false);
  });

  it("keeps the outcome active after actions finish until outcome evidence exists", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "progressing",
      priority: "high",
      outcomeVerified: false,
      dependencies: [dependency({ status: "satisfied" })],
      work: { ...noWork, assignmentsCompleted: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("active");
    expect(evaluation.requiresReplan).toBe(true);
    expect(evaluation.summary).toContain("actual outcome");
  });

  it("completes only when required dependencies and outcome evidence agree", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "progressing",
      priority: "high",
      outcomeVerified: true,
      dependencies: [dependency({ status: "satisfied" })],
      work: { ...noWork, assignmentsCompleted: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("completed");
    expect(evaluation.ownerAttention).toBe(false);
  });

  it("routes only genuine owner dependencies to owner attention", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "active",
      priority: "high",
      dependencies: [
        dependency({
          dependencyType: "information",
          title: "Owner must choose the lawful screening policy",
          status: "blocked",
          ownerActionRequired: true,
        }),
      ],
      work: noWork,
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("needs_owner");
    expect(evaluation.ownerAttention).toBe(true);
    expect(evaluation.blindSpots).toEqual([
      expect.objectContaining({
        type: "information",
        ownerActionRequired: true,
      }),
    ]);
  });

  it("recognizes disconnected integrations as blind spots without inventing success", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "active",
      priority: "normal",
      dependencies: [
        dependency({
          dependencyType: "integration",
          title: "Payment provider is disconnected",
          status: "blocked",
        }),
      ],
      work: noWork,
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("blocked");
    expect(evaluation.requiresReplan).toBe(true);
    expect(evaluation.blindSpots[0]?.title).toContain("disconnected");
  });

  it("does not confuse provider acceptance with completed external work", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "active",
      priority: "normal",
      dependencies: [],
      work: { ...noWork, outboundActionsOpen: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("progressing");
    expect(evaluation.summary).toContain("in progress");
  });

  it("requests replanning when a linked action fails", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "progressing",
      priority: "normal",
      dependencies: [],
      work: { ...noWork, outboundActionsFailed: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("blocked");
    expect(evaluation.requiresReplan).toBe(true);
    expect(evaluation.ownerAttention).toBe(false);
  });

  it("escalates a missed critical target only when no work is still advancing it", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "active",
      priority: "critical",
      targetAt: "2026-10-07T11:00:00.000Z",
      dependencies: [],
      work: noWork,
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("needs_owner");
    expect(evaluation.ownerAttention).toBe(true);
  });

  it("leaves terminal goals terminal instead of reopening them on later scans", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "verified",
      priority: "normal",
      dependencies: [dependency({ status: "failed" })],
      work: { ...noWork, outboundActionsFailed: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("verified");
    expect(evaluation.ownerAttention).toBe(false);
  });

  it("leaves an owner-paused goal dormant until an explicit resume", () => {
    const evaluation = evaluateOperatingGoal({
      currentStatus: "paused",
      priority: "critical",
      dependencies: [dependency({ status: "failed", ownerActionRequired: true })],
      work: { ...noWork, outboundActionsFailed: 1 },
      now: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(evaluation.status).toBe("paused");
    expect(evaluation.requiresReplan).toBe(false);
    expect(evaluation.ownerAttention).toBe(false);
    expect(evaluation.nextEvaluationAt).toBe("2027-10-07T12:00:00.000Z");
  });
});
