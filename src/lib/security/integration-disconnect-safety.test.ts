import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/app/integrations/actions.ts"),
  "utf8"
);

function disconnectBody() {
  const start = source.indexOf("export async function disconnectCustomerIntegrationAction");
  const end = source.indexOf("\nexport async function ", start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("customer integration disconnect safety", () => {
  it("requires workspace-management permission and refuses managed/shared providers", () => {
    const body = disconnectBody();
    expect(body).toContain('requirePermission("tenant:manage")');
    expect(body).toContain('connection.ownership_mode === "ferocity_managed"');
    expect(body).toContain('connection.provider.endsWith("_shared")');
  });

  it("revokes credentials, routing, queued work, and mailbox access atomically", () => {
    const body = disconnectBody();
    expect(body).toContain("withPostgresTransactionResult");
    expect(body).toContain("encrypted_secret=null");
    expect(body).toContain("live_actions_enabled=false");
    expect(body).toContain("status='blocked'");
    expect(body).toContain("read_enabled=false,send_enabled=false");
    expect(body).toContain("No partial revocation was retained");
  });
});
