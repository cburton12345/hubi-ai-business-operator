import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("capability trust operational contract", () => {
  const migration = source("supabase/migrations/192_capability_trust_and_execution_health.sql");
  const queue = source("src/lib/actions-queue/process-ready-messages.ts");
  const receipts = source("src/lib/messaging/message-health.ts");
  const automation = source("src/lib/automation/run-business-automation.ts");
  const approvals = source("src/app/app/approvals/actions.ts");

  it("keeps trust, dependencies, execution evidence, and circuits tenant-isolated", () => {
    for (const table of ["capability_trust_profiles", "capability_dependencies", "capability_execution_audits", "capability_circuit_breakers"]) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("public.has_tenant_role(tenant_id");
    expect(migration).toContain("unique (tenant_id, idempotency_key)");
  });

  it("wraps the existing queue rather than introducing another executor", () => {
    expect(queue).toContain("beginCapabilityExecution");
    expect(queue).toContain("recordCapabilityProviderResult");
    expect(queue).toContain("evaluateFallback");
    expect(migration).not.toContain("create table if not exists public.capability_action_queue");
  });

  it("promotes delivery only from provider receipt evidence", () => {
    expect(receipts).toContain("recordCapabilityDeliveryEvidence");
    expect(receipts).toContain('receipt.normalizedStatus === "delivered"');
  });

  it("runs health reconciliation and expected-event watchdogs in the existing automation loop", () => {
    expect(automation).toContain("syncCapabilityTrustHealthForTenant");
    expect(automation).toContain("runCapabilityReliabilityWatchdog");
  });

  it("uses meaningful owner change requests as a trust signal", () => {
    expect(approvals).toContain("recordCapabilityCorrection");
    expect(approvals).toContain('decision === "changes_requested"');
  });
});
