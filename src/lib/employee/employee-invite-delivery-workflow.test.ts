import { describe, expect, it, vi } from "vitest";
import { deliverEmployeeInviteWithClient } from "./employee-invite-delivery-workflow";

type Lifecycle = { delivery_state: string | null; attempt_id: string | null };

function workflowHarness(options: { failInviteWrite?: boolean; failFinalWrite?: boolean } = {}) {
  const state: { lifecycle: Lifecycle; inviteHash: string | null } = {
    lifecycle: { delivery_state: "failed", attempt_id: "old-attempt" },
    inviteHash: "old-hash"
  };
  let lockTail = Promise.resolve();
  const lockKeys: string[] = [];

  function client() {
    let releaseLock: (() => void) | null = null;
    let staged: typeof state | null = null;
    return {
      async query<T>(sql: string, values: unknown[] = []) {
        if (sql.includes("metadata_json->>'inviteDelivery'")) {
          return { rows: [{ ...state.lifecycle } as T], rowCount: 1 };
        }
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKeys.push(String(values[0]));
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previous;
          return { rows: [] as T[], rowCount: 1 };
        }
        if (sql === "begin") {
          staged = { lifecycle: { ...state.lifecycle }, inviteHash: state.inviteHash };
          return { rows: [] as T[], rowCount: null };
        }
        if (sql === "commit") {
          if (staged) {
            state.lifecycle = staged.lifecycle;
            state.inviteHash = staged.inviteHash;
          }
          staged = null;
          releaseLock?.();
          releaseLock = null;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql === "rollback") {
          staged = null;
          releaseLock?.();
          releaseLock = null;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql.includes("insert into public.owner_command_events")) {
          const metadata = JSON.parse(String(values[6])) as { inviteDelivery: string; deliveryAttemptId: string };
          if (!staged) throw new Error("event write outside transaction");
          staged.lifecycle = {
            delivery_state: metadata.inviteDelivery,
            attempt_id: metadata.deliveryAttemptId
          };
          return { rows: [{ id: "event-a" } as T], rowCount: 1 };
        }
        if (sql.includes("insert into public.workspace_invites")) {
          if (options.failInviteWrite) return { rows: [] as T[], rowCount: 0 };
          if (!staged) throw new Error("invite write outside transaction");
          staged.inviteHash = String(values[3]);
          return { rows: [{ invite_token_hash: staged.inviteHash } as T], rowCount: 1 };
        }
        if (sql.includes("update public.owner_command_events")) {
          if (options.failFinalWrite) return { rows: [] as T[], rowCount: 0 };
          if (!staged) throw new Error("event finalization outside transaction");
          const metadata = JSON.parse(String(values[12])) as { inviteDelivery: string };
          staged.lifecycle = {
            delivery_state: metadata.inviteDelivery,
            attempt_id: String(values[2])
          };
          return { rows: [] as T[], rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
  }

  return { state, client, lockKeys };
}

const input = {
  tenantId: "tenant-a",
  workerId: "worker-a",
  workerName: "Employee",
  email: "employee@example.com",
  invitedByUserId: "owner-a"
};

describe("employee invite delivery workflow", () => {
  it("never calls the provider when token persistence is not confirmed", async () => {
    const harness = workflowHarness({ failInviteWrite: true });
    const deliver = vi.fn(async () => ({ ok: true as const }));
    const result = await deliverEmployeeInviteWithClient(harness.client() as never, input, deliver, () => "token-a");
    expect(result).toEqual({ ok: false, outcome: "persistence_failed" });
    expect(deliver).not.toHaveBeenCalled();
    expect(harness.state.inviteHash).toBe("old-hash");
  });

  it("leaves the committed sending alert visible when post-send finalization fails", async () => {
    const harness = workflowHarness({ failFinalWrite: true });
    const result = await deliverEmployeeInviteWithClient(
      harness.client() as never,
      input,
      async () => ({ ok: true as const }),
      () => "token-a"
    );
    expect(result).toEqual({ ok: false, outcome: "outcome_unknown" });
    expect(harness.state.lifecycle.delivery_state).toBe("sending");
    expect(harness.state.inviteHash).not.toBe("old-hash");
  });

  it("serializes overlapping resends and does not rotate or send the second link", async () => {
    const harness = workflowHarness();
    let releaseDelivery!: () => void;
    let deliveryStarted!: () => void;
    const started = new Promise<void>((resolve) => { deliveryStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const firstDeliver = vi.fn(async () => {
      deliveryStarted();
      await gate;
      return { ok: true as const };
    });
    const secondDeliver = vi.fn(async () => ({ ok: true as const }));

    const first = deliverEmployeeInviteWithClient(harness.client() as never, input, firstDeliver, () => "token-a");
    await started;
    const second = deliverEmployeeInviteWithClient(harness.client() as never, input, secondDeliver, () => "token-b");
    releaseDelivery();

    expect(await first).toEqual({ ok: true, outcome: "delivered" });
    expect(await second).toEqual({ ok: false, outcome: "outcome_unknown" });
    expect(firstDeliver).toHaveBeenCalledTimes(1);
    expect(secondDeliver).not.toHaveBeenCalled();
    expect(harness.state.lifecycle.delivery_state).toBe("delivered");
  });

  it("blocks rotation after an unknown prior delivery outcome", async () => {
    const harness = workflowHarness();
    harness.state.lifecycle = { delivery_state: "sending", attempt_id: "unknown-attempt" };
    const deliver = vi.fn(async () => ({ ok: true as const }));
    const result = await deliverEmployeeInviteWithClient(harness.client() as never, input, deliver, () => "token-b");
    expect(result).toEqual({ ok: false, outcome: "outcome_unknown" });
    expect(deliver).not.toHaveBeenCalled();
    expect(harness.state.inviteHash).toBe("old-hash");
  });

  it("uses one canonical claim for duplicate workers with the same normalized email", async () => {
    const harness = workflowHarness();
    let releaseDelivery!: () => void;
    let deliveryStarted!: () => void;
    const started = new Promise<void>((resolve) => { deliveryStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const firstDeliver = vi.fn(async () => {
      deliveryStarted();
      await gate;
      return { ok: true as const };
    });
    const duplicateDeliver = vi.fn(async () => ({ ok: true as const }));
    const first = deliverEmployeeInviteWithClient(harness.client() as never, input, firstDeliver, () => "token-a");
    await started;
    const duplicate = deliverEmployeeInviteWithClient(
      harness.client() as never,
      { ...input, workerId: "worker-b", email: " Employee@Example.com " },
      duplicateDeliver,
      () => "token-b"
    );
    releaseDelivery();

    expect(await first).toEqual({ ok: true, outcome: "delivered" });
    expect(await duplicate).toEqual({ ok: false, outcome: "outcome_unknown" });
    expect(duplicateDeliver).not.toHaveBeenCalled();
    expect(new Set(harness.lockKeys).size).toBe(1);
  });

  it("records a failed provider attempt as retryable without losing the persisted link", async () => {
    const harness = workflowHarness();
    const result = await deliverEmployeeInviteWithClient(
      harness.client() as never,
      input,
      async () => ({ ok: false, error: "provider rejected delivery" }),
      () => "token-a"
    );
    expect(result).toEqual({ ok: false, outcome: "delivery_failed" });
    expect(harness.state.lifecycle.delivery_state).toBe("failed");
    expect(harness.state.inviteHash).not.toBe("old-hash");
  });
});
