import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("employee field access safety", () => {
  it("scopes visit reads and all employee visit mutations to assigned work", () => {
    expect(source("src/lib/field-ops/get-field-visit.ts")).toContain("canAccessEmployeeVisit");
    const actions = source("src/app/employee/visits/[visitId]/actions.ts");
    expect(actions.match(/requireEmployeeVisitAccess/g)?.length).toBeGreaterThanOrEqual(4);
    expect(actions).not.toContain('requirePermission("lead:manage")');
  });

  it("derives employee identity server-side and ignores a posted employee worker id", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    expect(actions).toContain("getEmployeeAccessContext()");
    expect(actions).toContain("context.workerId");
    expect(actions).toContain("canAccessEmployeeAssignment");
  });

  it("rejects archived assignments for new employee clock-ins without coupling clock-out to assignment state", () => {
    const access = source("src/lib/employee/employee-access.ts");
    const actions = source("src/app/app/operations-workforce/actions.ts");
    expect(access.match(/status <> 'archived'/g)?.length).toBeGreaterThanOrEqual(2);
    const clockIn = actions.slice(actions.indexOf("export async function createClockInAction"), actions.indexOf("export async function clockOutTimeEntryAction"));
    const clockOut = actions.slice(actions.indexOf("export async function clockOutTimeEntryAction"), actions.indexOf("export async function createExpenseAction"));
    expect(clockIn).toContain("resolveWorkerActionTarget");
    expect(clockOut).toContain("closeTimeClockEntry");
    expect(clockOut).not.toContain("canAccessEmployeeAssignment");
  });

  it("returns explicit employee clock failure states and renders them accessibly", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    const form = source("src/components/employee/EmployeeTimeClockForm.tsx");
    expect(actions).toContain("Your shift remains open");
    expect(actions).toContain("Clock-in was not saved");
    expect(form).toContain("useActionState");
    expect(form).toContain('aria-live="polite"');
  });

  it("requires private storage for employee proof and uses an authorized download route", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    const route = source("src/app/api/field/media/[mediaId]/route.ts");
    expect(actions).toContain("target.employeeMode && !uploaded.storageUri");
    expect(route).toContain("canAccessEmployeeAssignment");
    expect(route).toContain("createSignedUrl");
    expect(route).toContain("context.canManageAll");
  });
});
