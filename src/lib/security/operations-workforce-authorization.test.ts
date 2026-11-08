import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(
  join(process.cwd(), "src/app/app/operations-workforce/actions.ts"),
  "utf8"
);
const employeeWorkday = readFileSync(
  join(process.cwd(), "src/lib/employee/get-employee-workday.ts"),
  "utf8"
);
const workforceDashboard = readFileSync(
  join(process.cwd(), "src/lib/operations-workforce/get-operations-workforce-dashboard.ts"),
  "utf8"
);

function actionBody(name: string) {
  const start = actions.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = actions.indexOf("\nexport async function ", start + 1);
  return actions.slice(start, next === -1 ? actions.length : next);
}

describe("operations workforce mutation authorization", () => {
  it.each([
    "createAssignmentAction",
    "createRecurringExpenseAction",
    "updateRecurringExpenseStatusAction",
    "createMaterialLogAction",
    "createLocationPingAction",
    "createCustomerUpdateDraftAction"
  ])("requires operational mutation permission for %s", (name) => {
    expect(actionBody(name)).toContain('requirePermission("lead:manage")');
  });

  it.each([
    "createPayrollExportAction",
    "markPayrollExportReadyAction",
    "markPayrollExportedAction"
  ])("requires workspace management permission for %s", (name) => {
    expect(actionBody(name)).toContain('requirePermission("tenant:manage")');
  });

  it("separates draft preparation, approval, and external sending authority", () => {
    expect(actionBody("createCustomerUpdateDraftAction")).toContain('requirePermission("lead:manage")');
    expect(actionBody("approveCustomerUpdateDraftAction")).toContain('requirePermission("approval:review_low")');
    expect(actionBody("sendCustomerUpdateDraftAction")).toContain('requirePermission("approval:review_medium")');
  });

  it("limits punch-list updates to the assigned employee or an authorized manager", () => {
    const body = actionBody("updateAssignmentTaskStatusAction");
    expect(body).toContain("getEmployeeAccessContext");
    expect(body).toContain("canAccessEmployeeAssignment");
    expect(body).toContain("context.tenantId");
  });

  it.each([
    ["createAssignmentAction", "operations_workers"],
    ["createMaterialLogAction", "operations_assignments"],
    ["createLocationPingAction", "operations_assignments"],
    ["createCustomerUpdateDraftAction", "operations_assignments"]
  ])("validates related records against the active tenant in %s", (name, table) => {
    const body = actionBody(name);
    expect(body).toContain("tenantOwnsReference");
    expect(body).toContain(table);
  });

  it("scopes supervisor-recorded advances and their assignments to the supervisor crew", () => {
    const body = actionBody("createEmployeeCashAdvanceAction");
    expect(body).toContain("getTimeSupervisorScope");
    expect(body).toContain("timeScopeAllowsWorker");
    expect(body).toContain('scope.mode === "crew_leader"');
    expect(body).toContain("crew.crew_leader_worker_id=$6");
    expect(body).toContain("assignment.status<>'archived'");
  });

  it("uses the configured workspace timezone for overnight today-hour boundaries", () => {
    for (const source of [employeeWorkday,workforceDashboard]) {
      expect(source).toContain("timezone from public.workspace_settings");
      expect(source).toContain("at time zone settings.timezone");
      expect(source).toContain("clock_in_at<bounds.ends_at");
    }
  });
});
