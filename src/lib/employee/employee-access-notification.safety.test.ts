import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("employee access notification actions", () => {
  it("keeps authorization and the decision transaction inside the server action", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    const start = actions.indexOf("export async function decideEmployeeAccessRequestAction");
    const end = actions.indexOf("\nexport async function ", start + 1);
    const body = actions.slice(start, end);
    expect(body).toContain('requirePermission("tenant:manage")');
    expect(body).toContain("withPostgresTransactionResult");
    expect(body).toContain("decideEmployeeAccessRequest");
    expect(body).toContain('revalidatePath("/app/notifications")');
  });

  it("only exposes inline decisions for pending employee owner events", () => {
    const dashboard = source("src/lib/push/get-push-notification-dashboard.ts");
    const page = source("src/app/app/notifications/page.tsx");
    expect(dashboard).toContain("e.event_type = 'employee.access.requested'");
    expect(dashboard).toContain("e.metadata_json->>'accessRequestId'");
    expect(page).toContain('notification.status === "needs_owner"');
    expect(page).toContain("notification.employeeAccessRequestId");
    expect(page).toContain("decideEmployeeAccessRequestAction");
    expect(page).toContain("dashboard.canManageEmployeeAccess");
  });

  it("uses one correlated invite-delivery lifecycle and owner-gates retry", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    const decision = source("src/lib/employee/employee-access-decision.ts");
    const workflow = source("src/lib/employee/employee-invite-delivery-workflow.ts");
    const workforcePage = source("src/app/app/operations-workforce/page.tsx");
    const retryStart = actions.indexOf("export async function sendEmployeeInviteAction");
    const retryEnd = actions.indexOf("\nexport async function ", retryStart + 1);
    const retry = actions.slice(retryStart, retryEnd);
    expect(retry).toContain('requirePermission("tenant:manage")');
    expect(retry).toContain("createEmployeeInvite");
    expect(decision).toContain("employeeInviteEventId(input.tenantId, request.email)");
    expect(workflow).toContain("employeeInviteEventId(input.tenantId, input.email)");
    expect(decision).not.toContain("insert into public.workspace_invites");
    expect(workflow).toContain("pg_advisory_xact_lock");
    expect(workflow).toContain("returning invite_token_hash");
    expect(workforcePage).toContain(
      'worker.access === "Invite available" && canManageEmployeeAccess',
    );
  });

  it("keeps decline-delivery recovery separate and never recommends an invite", () => {
    const actions = source("src/app/app/operations-workforce/actions.ts");
    const decision = source("src/lib/employee/employee-access-decision.ts");
    expect(decision).toContain("employee-access-decline-delivery-${request.id}");
    expect(decision).toContain("Do not send an employee invite.");
    expect(actions).toContain("employee-access-decline-delivery-${accessRequest.id}");
    const finalizeStart = actions.indexOf("async function finalizeDeclineDelivery");
    const finalizeEnd = actions.indexOf("\nasync function ", finalizeStart + 1);
    const finalize = actions.slice(finalizeStart, finalizeEnd);
    expect(finalize).toContain("Contact the person directly about the declined request.");
    expect(finalize).not.toContain("Send secure employee invite");
  });
});
