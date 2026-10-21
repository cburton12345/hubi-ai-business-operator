import { beforeEach, describe, expect, it, vi } from "vitest";

const { withPostgresTransactionResult } = vi.hoisted(() => ({
  withPostgresTransactionResult: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: vi.fn(),
  withPostgresTransactionResult,
}));

import { correctLatestOperatingGoalFromThread } from "./goal-engine";

describe("operating goal correction continuity", () => {
  beforeEach(() => {
    withPostgresTransactionResult.mockReset();
  });

  it("updates the same goal, cancels only unstarted work, and surfaces running work", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("select id,title,desired_outcome,status,evaluation_version")) {
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000001",
          title: "Move John into Unit 1",
          desired_outcome: "John occupies Unit 1",
          status: "progressing",
          evaluation_version: 3,
        }] };
      }
      if (sql.includes("update public.operating_goal_steps")) {
        return {
          rows: [{
            plan_version: 3,
            step_key: "prepare-lease",
            reference_table: "office_manager_action_requests",
            reference_id: "00000000-0000-4000-8000-000000000002",
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("select count(*)::text as count")) return { rows: [{ count: "1" }] };
      return { rows: [], rowCount: 1 };
    });
    withPostgresTransactionResult.mockImplementation(async (operation) => ({
      ok: true,
      value: await operation({ query }),
    }));

    const result = await correctLatestOperatingGoalFromThread({
      tenantId: "00000000-0000-4000-8000-000000000010",
      threadId: "thread-1",
      correctedOutcome: "John occupies Unit 2",
      actorUserId: "00000000-0000-4000-8000-000000000011",
    });

    expect(result).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      desiredOutcome: "John occupies Unit 2",
      canceledUnstartedStepCount: 1,
      inProgressStepCount: 1,
    });
    const stepCancellationSql = query.mock.calls.find(([sql]) => String(sql).includes("update public.operating_goal_steps"))?.[0];
    expect(stepCancellationSql).toContain("status in ('planned','ready','waiting','blocked','needs_owner')");
    expect(stepCancellationSql).not.toContain("'in_progress'");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("'owner_correction'"))).toBe(true);
  });

  it("does not invent a goal when the chat has no active persistent outcome", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    withPostgresTransactionResult.mockImplementation(async (operation) => ({
      ok: true,
      value: await operation({ query }),
    }));

    await expect(correctLatestOperatingGoalFromThread({
      tenantId: "00000000-0000-4000-8000-000000000010",
      threadId: "thread-without-goal",
      correctedOutcome: "Use Unit 2",
    })).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
