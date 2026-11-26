import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const source = (path: string) => readFileSync(path,"utf8").replace(/\r\n/g,"\n");

describe("offline workforce actions",() => {
  it("keeps device retries idempotent across time, expense, payment, and location facts",() => {
    const route = source("src/app/api/workforce/mobile-actions/route.ts");
    const migration = source("supabase/migrations/294_offline_workforce_actions.sql");
    expect(route).toContain("idempotencyKey: action.clientMutationId");
    expect(route).toContain("on conflict (tenant_id,client_mutation_id)");
    expect(migration).toContain("uniq_operations_expenses_client_mutation");
    expect(migration).toContain("uniq_worker_payments_client_mutation");
    expect(migration).toContain("uniq_location_pings_client_mutation");
  });

  it("allows own-worker actions or scoped supervisor actions but not arbitrary workers",() => {
    const route = source("src/app/api/workforce/mobile-actions/route.ts");
    expect(route).toContain("if (!session) return NextResponse.json({ error: \"Unauthorized\" }");
    expect(route).toContain("employee.workerId === action.workerId");
    expect(route).toContain("timeScopeAllowsWorker(supervisor,action.workerId)");
    expect(route).toContain("Only an authorized owner or manager can record a payment.");
  });

  it("captures location only for an explicit action and never starts continuous tracking",() => {
    const component = source("src/components/employee/WorkforceQuickActions.tsx");
    expect(component).toContain("navigator.geolocation.getCurrentPosition");
    expect(component).not.toContain("watchPosition");
    expect(component).toContain("Saved offline. It will upload automatically.");
    expect(component).toContain("ferocity-workforce-sync");
    expect(source("public/sw.js")).toContain("flushWorkforceActions");
  });

  it("preserves manual work location and outside-company context beside GPS evidence",() => {
    const component = source("src/components/employee/WorkforceQuickActions.tsx");
    const route = source("src/app/api/workforce/mobile-actions/route.ts");
    expect(component).toContain("manualLocation");
    expect(component).toContain("workContext");
    expect(route).toContain("GPS near");
    expect(route).toContain("manualLocation: action.manualLocation ?? null");
    expect(route).toContain("workContext: action.workContext ?? null");
    expect(route).toContain('action.location ? "gps" : "manual"');
  });

  it("keeps receipt evidence on the device and enforces a bounded offline payload",() => {
    const component = source("src/components/employee/WorkforceQuickActions.tsx");
    const route = source("src/app/api/workforce/mobile-actions/route.ts");
    expect(component).toContain("file.size > 4_000_000");
    expect(route).toContain("max(4_000_000)");
    expect(route).toContain("bytes.byteLength !== receipt.size");
  });
});
