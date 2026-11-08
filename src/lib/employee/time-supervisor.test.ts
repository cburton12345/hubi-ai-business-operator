import { describe,expect,it } from "vitest";
import { timeScopeAllowsWorker,type TimeSupervisorScope } from "./time-supervisor";

function scope(values: Partial<TimeSupervisorScope>): TimeSupervisorScope {
  return { tenantId: "tenant-a",actorUserId: "user-a",actorWorkerId: "leader-a",mode: "crew_leader",allowedWorkerIds: ["leader-a","worker-a"],...values };
}

describe("time supervisor scope", () => {
  it("allows a foreman to update only workers in the crews they lead", () => {
    const foreman = scope({});
    expect(timeScopeAllowsWorker(foreman,"worker-a")).toBe(true);
    expect(timeScopeAllowsWorker(foreman,"foreign-worker")).toBe(false);
  });

  it("does not give an ordinary worker crew-time authority", () => {
    expect(timeScopeAllowsWorker(scope({ mode: "none",allowedWorkerIds: [] }),"worker-a")).toBe(false);
  });

  it("keeps existing workspace time managers unrestricted inside the tenant query boundary", () => {
    expect(timeScopeAllowsWorker(scope({ mode: "workspace",allowedWorkerIds: null }),"worker-z")).toBe(true);
  });
});
