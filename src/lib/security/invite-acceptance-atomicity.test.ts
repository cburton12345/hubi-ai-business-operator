import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("workspace invitation acceptance atomicity", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/invite/[token]/actions.ts"), "utf8");

  it("locks and consumes a still-pending invitation inside one transaction", () => {
    expect(source).toContain("withPostgresTransactionResult");
    expect(source).toContain("for update");
    expect(source).toContain("where id = $1 and status = 'pending'");
    expect(source).toContain("returning id");
  });

  it("creates credentials, membership, employee linkage, invite consumption, and session atomically", () => {
    const transactionStart = source.indexOf("withPostgresTransactionResult");
    for (const required of [
      "public.user_password_credentials",
      "public.operations_workers",
      "public.tenant_users",
      "public.workspace_invites",
      "public.app_sessions"
    ]) {
      expect(source.indexOf(required, transactionStart)).toBeGreaterThan(transactionStart);
    }
  });
});
