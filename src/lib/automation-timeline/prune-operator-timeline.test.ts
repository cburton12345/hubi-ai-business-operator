import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, poolMock } = vi.hoisted(() => {
  const query = vi.fn();
  return { queryMock: query, poolMock: { query } };
});

vi.mock("@/lib/db/postgres", () => ({ createPostgresPool: () => poolMock }));

import { pruneOperatorTimelineEvents } from "./prune-operator-timeline";

describe("operator timeline retention", () => {
  beforeEach(() => queryMock.mockReset());

  it("deletes bounded batches until the database reports exhaustion", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ deleted_rows: 5_000 }] })
      .mockResolvedValueOnce({ rows: [{ deleted_rows: 731 }] });

    const result = await pruneOperatorTimelineEvents({ retainDays: 30, batchSize: 5_000 });

    expect(result).toMatchObject({
      retainDays: 30,
      batchSize: 5_000,
      batches: 2,
      deletedRows: 5_731,
      exhausted: true,
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0]).toEqual([
      "select public.prune_operator_timeline_events($1, $2) as deleted_rows",
      [30, 5_000],
    ]);
  });

  it("stops at the maximum batch count without claiming exhaustion", async () => {
    queryMock.mockResolvedValue({ rows: [{ deleted_rows: 10 }] });
    const result = await pruneOperatorTimelineEvents({ batchSize: 10, maxBatches: 2 });
    expect(result).toMatchObject({ batches: 2, deletedRows: 20, exhausted: false });
  });

  it("fails closed on malformed database output", async () => {
    queryMock.mockResolvedValue({ rows: [{ deleted_rows: -1 }] });
    await expect(pruneOperatorTimelineEvents()).rejects.toThrow("invalid deletion count");
  });

  it("pins the SQL boundary to noisy telemetry and a minimum 30-day window", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/286_operator_timeline_retention.sql"),
      "utf8",
    );
    for (const eventType of [
      "business_automation_loop",
      "action_queue_scan",
      "service_control_blocked",
      "ai_agent_workflow_run",
    ]) {
      expect(migration).toContain(`'${eventType}'`);
    }
    expect(migration).toContain("p_retain_days < 30");
    expect(migration).toContain("limit p_batch_size");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).not.toMatch(/event_family\s*=/);
  });

  it("schedules hourly database-side retention when pg_cron is available", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/287_operator_timeline_retention_schedule.sql"),
      "utf8",
    );
    expect(migration).toContain("pg_available_extensions");
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("ferocity-operator-timeline-retention");
    expect(migration).toContain("'17 * * * *'");
    expect(migration).toContain("prune_operator_timeline_events(30, 5000)");
    expect(migration).toContain("cron.unschedule(existing_job_id)");
  });
});
