import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("worker Spanish flow contracts", () => {
  it("keeps employee invite acceptance on the employee destination", () => {
    const action = source("src/app/invite/[token]/actions.ts");
    expect(action).toContain('const destination = employeeInvite ? "/employee"');
    expect(action).toContain('mode=field&next=/employee&lang=es');
    expect(action).toContain('subject: spanish ? "Su cuenta de empleado de Ferocity está lista"');
  });

  it("keeps password recovery on its dedicated single-purpose token contract", () => {
    const action = source("src/app/reset-password/actions.ts");
    expect(action).toContain("issueLocalPasswordReset");
    expect(action).toContain("/reset-password/${token}");
    expect(action).not.toContain("workspace_invites");
  });

  it("preserves locale through public employee-access errors", () => {
    const route = source("src/app/api/public/employee-access/route.ts");
    expect(route).toContain("withWorkerLocale");
    expect(route).toContain('withWorkerLocale("/employee/join?error=limit", fallbackLocale)');
    expect(route).toContain('withWorkerLocale("/employee/join?error=invalid", locale)');
  });

  it("localizes the authenticated worker shell and dashboard link", () => {
    const page = source("src/app/employee/page.tsx");
    const workday = source("src/components/employee/EmployeeWorkday.tsx");
    expect(page).toContain('spanish ? "Equipo de campo" : "Field team"');
    expect(page).toContain('spanish ? "Cerrar sesión" : "Sign out"');
    expect(workday).toContain('dashboardLabel={language === "es" ? "Panel" : "Dashboard"}');
  });
});
