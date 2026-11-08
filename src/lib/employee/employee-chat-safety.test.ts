import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync("src/lib/employee/employee-chat.ts", "utf8");
const action = readFileSync("src/app/employee/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/247_employee_ferocity_chat.sql", "utf8");

describe("employee Ferocity security contract", () => {
  it("does not load financial or payroll fields into the employee chat context", () => {
    const scopedQuery = runtime.slice(runtime.indexOf("export async function getEmployeeOperationalContext"), runtime.indexOf("export async function interpretEmployeeChat"));
    expect(scopedQuery).not.toMatch(/invoice|estimate|margin|hourly_rate|payroll|amount_cents/i);
    expect(runtime).not.toContain("getEmployeeWorkday");
  });

  it("rechecks assignment and visit access before worker writes", () => {
    expect(action).toContain("canAccessEmployeeAssignment");
    expect(action).toContain("canAccessEmployeeVisit");
    expect(action).toContain("verifiedExecution");
  });

  it("stores original message language and separates employee RLS from operator access", () => {
    expect(action).toContain("original_language");
    expect(migration).toContain("role='employee' and user_id=public.current_app_user_id()");
    expect(migration).toContain("public.has_tenant_role(tenant_id,array['owner','admin','operator'])");
    expect(migration).not.toContain("create policy ferocity_chat_threads_tenant_access");
  });
});
