import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/190_growth_learning_identity_and_events.sql"), "utf8");

describe("Growth schema security and durability contract", () => {
  it("tenant-scopes new business records and enables RLS", () => {
    expect(migration.match(/tenant_id uuid not null/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("public.has_tenant_role");
  });

  it("keeps assisted connector bearer material hash-only and server-managed", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("device_id_hash text not null");
    expect(migration).toContain("drop policy if exists growth_connector_sessions_tenant_operator");
    expect(migration.toLowerCase()).not.toContain("facebook_password");
  });

  it("has idempotency boundaries for events, opportunities, and actions", () => {
    expect(migration).toContain("growth_events_idempotency_unique");
    expect(migration).toContain("growth_opportunities_idempotency_unique");
    expect(migration).toContain("growth_action_attempts_idempotency_unique");
  });

  it("carries attributed leads into existing estimates, jobs, and invoices", () => {
    expect(migration).toContain("service_estimates_growth_attribution");
    expect(migration).toContain("service_jobs_growth_attribution");
    expect(migration).toContain("service_invoices_growth_attribution");
    expect(migration).toContain("won_revenue_cents");
  });
});
