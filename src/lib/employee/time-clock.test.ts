import { describe, expect, it } from "vitest";
import { applyCrewTimeIntent,changeTimeClockBreak,closeTimeClockEntry,correctTimeClockEntry,createTimeClockEntry } from "./time-clock";

type Row = { id: string; tenantId: string; workerId: string; status: "open" };

function fakeClient(rows: Row[]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  return {
    calls,
    client: {
      async query<T>(sql: string, values: unknown[] = []) {
        calls.push({ sql, values });
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
        if (sql.includes("from public.operations_time_entries")) {
          const row = rows.find((item) => item.tenantId === values[0] && item.workerId === values[1] && item.status === "open");
          return { rows: row ? [{ id: row.id } as T] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.includes("insert into public.operations_time_entries")) {
          const row = { id: `entry-${rows.length + 1}`, tenantId: String(values[0]), workerId: String(values[1]), status: "open" as const };
          rows.push(row);
          return { rows: [{ id: row.id } as T], rowCount: 1 };
        }
        if (sql.includes("insert into public.operations_time_entry_events")) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected query: ${sql}`);
      }
    }
  };
}

const input = {
  tenantId: "tenant-a",
  workerId: "worker-a",
  assignmentId: null,
  clockInLocation: null,
  gpsVerified: false,
  notes: null,
  source: "employee_app" as const
};

describe("employee time clock", () => {
  it("returns the existing open entry on a replay without inserting another", async () => {
    const rows: Row[] = [{ id: "existing", tenantId: "tenant-a", workerId: "worker-a", status: "open" }];
    const fake = fakeClient(rows);
    const result = await createTimeClockEntry(fake.client as never, input);
    expect(result).toEqual({ id: "existing", created: false });
    expect(rows).toHaveLength(1);
    expect(fake.calls.some((call) => call.sql.includes("insert into"))).toBe(false);
  });

  it("uses a tenant-and-worker advisory lock before checking and inserting", async () => {
    const rows: Row[] = [];
    const fake = fakeClient(rows);
    const result = await createTimeClockEntry(fake.client as never, input);
    expect(result.created).toBe(true);
    expect(fake.calls[0]).toMatchObject({ values: ["employee-time-clock:tenant-a:worker-a"] });
    expect(fake.calls[0].sql).toContain("pg_advisory_xact_lock");
    expect(fake.calls[1].sql).toContain("tenant_id = $1 and worker_id = $2");
  });

  it("does not confuse the same worker identifier in a foreign tenant", async () => {
    const rows: Row[] = [{ id: "foreign", tenantId: "tenant-b", workerId: "worker-a", status: "open" }];
    const fake = fakeClient(rows);
    const result = await createTimeClockEntry(fake.client as never, input);
    expect(result).toEqual({ id: "entry-2", created: true });
    expect(rows.map((row) => row.tenantId)).toEqual(["tenant-b", "tenant-a"]);
  });

  it("serializes two concurrent first clock-ins so only one open row is created", async () => {
    const rows: Row[] = [];
    let tail = Promise.resolve();

    async function runTransaction() {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { release = resolve; });
      let ownsLock = false;
      const client = {
        async query<T>(sql: string, values: unknown[] = []) {
          if (sql.includes("pg_advisory_xact_lock")) {
            await previous;
            ownsLock = true;
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("from public.operations_time_entries")) {
            const row = rows.find((item) => item.tenantId === values[0] && item.workerId === values[1]);
            return { rows: row ? [{ id: row.id } as T] : [], rowCount: row ? 1 : 0 };
          }
          if (sql.includes("insert into public.operations_time_entries")) {
            const row = { id: `entry-${rows.length + 1}`, tenantId: String(values[0]), workerId: String(values[1]), status: "open" as const };
            rows.push(row);
            return { rows: [{ id: row.id } as T], rowCount: 1 };
          }
          if (sql.includes("insert into public.operations_time_entry_events")) return { rows: [], rowCount: 1 };
          throw new Error(`Unexpected query: ${sql}`);
        }
      };
      try {
        return await createTimeClockEntry(client as never, input);
      } finally {
        if (ownsLock) release();
      }
    }

    const results = await Promise.all([runTransaction(), runTransaction()]);
    expect(results).toEqual([
      { id: "entry-1", created: true },
      { id: "entry-1", created: false }
    ]);
    expect(rows).toHaveLength(1);
  });

  it("closes an owned open shift and returns confirmed success", async () => {
    const client = {
      async query<T>(sql: string) {
        if (sql.startsWith("select id,worker_id")) return { rows: [{ id: "entry-1", worker_id: "worker-a", status: "open", elapsed_minutes: "90",elapsed_seconds: "5400",effective_break_seconds: "0",break_started_at: null } as T], rowCount: 1 };
        if (sql.startsWith("update public.operations_time_entries")) return { rows: [{ id: "entry-1" } as T], rowCount: 1 };
        if (sql.includes("insert into public.operations_time_entry_events")) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    await expect(closeTimeClockEntry(client as never, {
      tenantId: "tenant-a", timeEntryId: "entry-1", workerId: "worker-a",
      clockOutLocation: null, breakMinutes: 30, notes: null, source: "employee_app"
    })).resolves.toEqual({ closed: true, id: "entry-1" });
  });

  it.each([
    ["excessive break", { id: "entry-1", worker_id: "worker-a", status: "open", elapsed_minutes: "20" }, "worker-a", 30, "break_exceeds_shift"],
    ["already closed", { id: "entry-1", worker_id: "worker-a", status: "needs_review", elapsed_minutes: "20" }, "worker-a", 0, "not_open"],
    ["wrong worker", { id: "entry-1", worker_id: "worker-b", status: "open", elapsed_minutes: "20" }, "worker-a", 0, "wrong_worker"]
  ])("keeps the shift unchanged for %s", async (_label, row, workerId, breakMinutes, reason) => {
    let updated = false;
    const client = {
      async query<T>(sql: string) {
        if (sql.startsWith("select id,worker_id")) return { rows: [{ ...row,elapsed_seconds: String(Number(row.elapsed_minutes)*60),effective_break_seconds: "0",break_started_at: null } as T], rowCount: 1 };
        updated = true;
        return { rows: [], rowCount: 0 };
      }
    };
    await expect(closeTimeClockEntry(client as never, {
      tenantId: "tenant-a", timeEntryId: "entry-1", workerId,
      clockOutLocation: null, breakMinutes, notes: null, source: "employee_app"
    })).resolves.toEqual({ closed: false, reason });
    expect(updated).toBe(false);
  });

  it("propagates a database failure so the server action can report an unsaved shift", async () => {
    const client = { query: async () => { throw new Error("synthetic database failure"); } };
    await expect(closeTimeClockEntry(client as never, {
      tenantId: "tenant-a", timeEntryId: "entry-1", workerId: "worker-a",
      clockOutLocation: null, breakMinutes: 0, notes: null, source: "employee_app"
    })).rejects.toThrow("synthetic database failure");
  });

  it("persists start and end break transitions and treats repeated taps as no-ops", async () => {
    let breakStarted = false;
    let breakSeconds = 0;
    const events: string[] = [];
    const client = { async query<T>(sql: string) {
      if (sql.startsWith("select id,worker_id,status,break_started_at")) return { rows: [{ id: "entry-1",worker_id: "worker-a",status: "open",break_started_at: breakStarted ? new Date() : null,break_seconds: breakSeconds } as T],rowCount: 1 };
      if (sql.includes("set break_started_at=now()")) { breakStarted = true; return { rows: [{ id: "entry-1",break_seconds: breakSeconds } as T],rowCount: 1 }; }
      if (sql.includes("set break_seconds=break_seconds")) { breakStarted = false;breakSeconds = 600;return { rows: [{ id: "entry-1",break_seconds: breakSeconds } as T],rowCount: 1 }; }
      if (sql.includes("insert into public.operations_time_entry_events")) { events.push("event");return { rows: [],rowCount: 1 }; }
      throw new Error(`Unexpected query: ${sql}`);
    }};
    await expect(changeTimeClockBreak(client as never,{ tenantId: "tenant-a",timeEntryId: "entry-1",workerId: "worker-a",mode: "start",source: "employee_app" })).resolves.toMatchObject({ changed: true });
    await expect(changeTimeClockBreak(client as never,{ tenantId: "tenant-a",timeEntryId: "entry-1",workerId: "worker-a",mode: "start",source: "employee_app" })).resolves.toEqual({ changed: false,reason: "already_on_break" });
    await expect(changeTimeClockBreak(client as never,{ tenantId: "tenant-a",timeEntryId: "entry-1",workerId: "worker-a",mode: "end",source: "employee_app" })).resolves.toEqual({ changed: true,id: "entry-1",breakSeconds: 600 });
    expect(events).toHaveLength(2);
  });

  it("records a reviewed correction without erasing the previous values", async () => {
    const calls: string[] = [];
    const client = { async query<T>(sql: string) {
      calls.push(sql);
      if (sql.startsWith("select id,worker_id,status,clock_in_at")) return { rows: [{ id: "entry-1",worker_id: "worker-a",status: "approved",clock_in_at: new Date("2026-10-27T12:00:00Z"),clock_out_at: new Date("2026-10-27T20:00:00Z"),break_seconds: 1800 } as T],rowCount: 1 };
      if (sql.startsWith("update public.operations_time_entries")) return { rows: [{ id: "entry-1" } as T],rowCount: 1 };
      if (sql.includes("insert into public.operations_time_entry_events")) return { rows: [],rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }};
    await expect(correctTimeClockEntry(client as never,{ tenantId: "tenant-a",timeEntryId: "entry-1",clockInAt: "2026-10-27T12:15:00Z",clockOutAt: "2026-10-27T20:00:00Z",breakMinutes: 30,reason: "Manager confirmed missed punch",actorUserId: "owner-a" })).resolves.toEqual({ corrected: true,id: "entry-1" });
    expect(calls.some((sql) => sql.includes("previous_state_json"))).toBe(true);
  });

  it("reports mixed bulk clock-out states without touching a foreign tenant", async () => {
    const open = new Map<string,string>([["tenant-a:worker-a","entry-a"],["tenant-b:worker-a","foreign-entry"]]);
    const client = { async query<T>(sql: string,values: unknown[] = []) {
      if (sql.startsWith("select id from public.operations_time_entries")) {
        const id = open.get(`${values[0]}:${values[1]}`);
        return { rows: id ? [{ id } as T] : [],rowCount: id ? 1 : 0 };
      }
      if (sql.startsWith("select id,worker_id,status")) {
        return { rows: [{ id: values[0],worker_id: "worker-a",status: "open",break_started_at: null,elapsed_seconds: "3600",elapsed_minutes: "60",effective_break_seconds: "0" } as T],rowCount: 1 };
      }
      if (sql.startsWith("update public.operations_time_entries")) {
        open.delete(`${values[1]}:worker-a`);
        return { rows: [{ id: values[0] } as T],rowCount: 1 };
      }
      if (sql.includes("insert into public.operations_time_entry_events")) return { rows: [],rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }};
    const base = { tenantId: "tenant-a",intent: "clock_out" as const,assignmentId: null,note: null,actorUserId: "manager-a",actorWorkerId: null };
    await expect(applyCrewTimeIntent(client as never,{ ...base,workerId: "worker-a" })).resolves.toMatchObject({ outcome: "applied" });
    await expect(applyCrewTimeIntent(client as never,{ ...base,workerId: "worker-b" })).resolves.toEqual({ outcome: "skipped",reason: "already_clocked_out" });
    expect(open.get("tenant-b:worker-a")).toBe("foreign-entry");
  });
});
