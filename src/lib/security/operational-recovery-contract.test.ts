import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("operational recovery controls", () => {
  it("makes integration revocation atomic and blocks queued provider work", () => {
    const actions = read("src/app/app/integrations/actions.ts");
    const start = actions.indexOf("export async function disconnectCustomerIntegrationAction");
    const end = actions.indexOf("\nexport async function ", start + 1);
    const body = actions.slice(start, end === -1 ? actions.length : end);
    expect(body).toContain("withPostgresTransactionResult");
    expect(body).toContain("encrypted_secret=null");
    expect(body).toContain("live_actions_enabled=false");
    expect(body).toContain("status='blocked'");
    expect(body).toContain("read_enabled=false,send_enabled=false");
    expect(body).toContain("No partial revocation was retained");
  });

  it("records capability emergency pause and resume changes in tenant-scoped evidence", () => {
    const actions = read("src/app/app/owner-command-center/actions.ts");
    const start = actions.indexOf("export async function setCapabilityEmergencyPauseAction");
    const next = actions.indexOf("\nexport async function ", start + 1);
    const body = actions.slice(start, next === -1 ? actions.length : next);
    expect(body).toContain('requirePermission("tenant:manage")');
    expect(body).toContain("where tenant_id=$1 and capability_key=$2");
    expect(body).toContain("capability_emergency_pause");
    expect(body).toContain("emergencyPauseChangedBy");
  });

  it("bounds message retries and preserves the original failed attempt", () => {
    const retry = read("src/lib/messaging/message-retry.ts");
    const actions = read("src/app/app/messaging/actions.ts");
    expect(retry).toContain("retry_limit_reached");
    expect(retry).toMatch(/retryAttempt\s*>=\s*3/);
    expect(actions).toContain("retry_of_message_id");
    expect(actions).toContain("message-retry:${original.id}:attempt:${retryAttempt}");
    expect(actions).toContain("humanApproved: true");
  });

  it("routes missing completion evidence to durable owner attention", () => {
    const runtime = read("src/lib/reliability/capability-runtime.ts");
    expect(runtime).toContain("runCapabilityReliabilityWatchdog");
    expect(runtime).toContain("expected_event_at < now()");
    expect(runtime).toContain('const nextState: CapabilityActionState = row.state === "delayed" || row.state === "unknown" ? "needs_attention" : "delayed"');
    expect(runtime).toContain("capability.expected_event_missing");
    expect(runtime).toContain("An expected result did not arrive");
  });

  it("keeps recovery state visible instead of reporting unavailable evidence as healthy", () => {
    const health = read("src/lib/observability/operational-health.ts");
    const page = read("src/app/app/system-health/page.tsx");
    expect(health).toContain('status: "unknown"');
    expect(health).toContain("not treating the system as healthy");
    expect(page).toContain("Health is unknown.");
    expect(page).toContain("Operational Runtime");
  });
});
