import { describe, expect, it } from "vitest";
import { decideEmployeeAccessRequest } from "./employee-access-decision";

type Decision = "approved" | "declined";

function decisionHarness() {
  const state = {
    request: {
      id: "request-a",
      tenantId: "tenant-a",
      name: "Employee",
      email: "employee@example.com",
      phone: null,
      preferred_language: "en" as const,
      status: "pending" as "pending" | "approved" | "declined"
    },
    workerId: "worker-a",
    inviteWrites: 0,
    eventResolutions: 0,
    deliveryPreparations: 0,
    deliveryState: null as string | null
  };
  let tail = Promise.resolve();

  async function run(decision: Decision, tenantId = "tenant-a") {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => { release = resolve; });
    let ownsLock = false;
    const client = {
      async query<T>(sql: string, values: unknown[] = []) {
        if (sql.includes("from public.employee_access_requests") && sql.includes("for update")) {
          await previous;
          ownsLock = true;
          if (values[0] !== state.request.tenantId || values[1] !== state.request.id) return { rows: [], rowCount: 0 };
          return { rows: [{
            id: state.request.id,
            name: state.request.name,
            email: state.request.email,
            phone: state.request.phone,
            preferred_language: state.request.preferred_language,
            status: state.request.status
          } as T], rowCount: 1 };
        }
        if (sql.includes("with existing as")) {
          return { rows: [{ id: state.workerId, user_id: null } as T], rowCount: 1 };
        }
        if (sql.includes("pg_advisory_xact_lock")) {
          return { rows: [] as T[], rowCount: 1 };
        }
        if (sql.includes("metadata_json->>'inviteDelivery'")) {
          return state.deliveryState
            ? { rows: [{ delivery_state: state.deliveryState } as T], rowCount: 1 }
            : { rows: [] as T[], rowCount: 0 };
        }
        if (sql.includes("insert into public.workspace_invites")) {
          state.inviteWrites += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("update public.employee_access_requests")) {
          state.request.status = sql.includes("status = 'approved'") ? "approved" : "declined";
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("update public.owner_command_events")) {
          state.eventResolutions += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("insert into public.owner_command_events")) {
          state.deliveryPreparations += 1;
          state.deliveryState = "pending";
          return { rows: [{ id: "delivery-event-a" } as T], rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    try {
      return await decideEmployeeAccessRequest(client as never, {
        tenantId,
        requestId: "request-a",
        decision,
        ownerNote: null,
        reviewerUserId: "owner-a",
      });
    } finally {
      if (ownsLock) release();
      else release();
    }
  }

  return { state, run };
}

describe("employee access decision", () => {
  it("makes a repeated approval a no-op without replacing the invite", async () => {
    const harness = decisionHarness();
    expect((await harness.run("approved")).outcome).toBe("approved");
    expect((await harness.run("approved")).outcome).toBe("not_pending");
    expect(harness.state.inviteWrites).toBe(0);
    expect(harness.state.eventResolutions).toBe(1);
    expect(harness.state.deliveryPreparations).toBe(1);
  });

  it("serializes competing approve and decline decisions so only one wins", async () => {
    const harness = decisionHarness();
    const outcomes = await Promise.all([harness.run("approved"), harness.run("declined")]);
    expect(outcomes.map((result) => result.outcome)).toEqual(["approved", "not_pending"]);
    expect(harness.state.request.status).toBe("approved");
    expect(harness.state.inviteWrites).toBe(0);
    expect(harness.state.eventResolutions).toBe(1);
    expect(harness.state.deliveryPreparations).toBe(1);
  });

  it("does not prepare an invite when the competing decline wins first", async () => {
    const harness = decisionHarness();
    const outcomes = await Promise.all([harness.run("declined"), harness.run("approved")]);
    expect(outcomes.map((result) => result.outcome)).toEqual(["declined", "not_pending"]);
    expect(harness.state.request.status).toBe("declined");
    expect(harness.state.inviteWrites).toBe(0);
    expect(harness.state.eventResolutions).toBe(1);
    expect(harness.state.deliveryPreparations).toBe(1);
  });

  it("does not find or mutate a request through a foreign tenant", async () => {
    const harness = decisionHarness();
    expect((await harness.run("approved", "tenant-b")).outcome).toBe("not_pending");
    expect(harness.state.request.status).toBe("pending");
    expect(harness.state.inviteWrites).toBe(0);
    expect(harness.state.eventResolutions).toBe(0);
    expect(harness.state.deliveryPreparations).toBe(0);
  });

  it("does not reset a sending invite attempt when approval overlaps a resend", async () => {
    const harness = decisionHarness();
    harness.state.deliveryState = "sending";
    expect((await harness.run("approved")).outcome).toBe("approved");
    expect(harness.state.deliveryState).toBe("sending");
    expect(harness.state.deliveryPreparations).toBe(0);
    expect(harness.state.inviteWrites).toBe(0);
  });
});
