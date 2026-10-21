import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("high-value form reliability", () => {
  it("uses a stable retry attempt key and advances the original message counter", () => {
    const actions = source("src/app/app/messaging/actions.ts");
    expect(actions).toContain("message-retry:${original.id}:attempt:${retryAttempt}");
    expect(actions).toContain("greatest(retry_attempt, $3)");
    expect(actions).not.toContain("message-retry:${original.id}:${crypto.randomUUID()}");
    expect(source("src/app/app/messaging/page.tsx")).toContain('pendingLabel="Retrying…"');
  });

  it("allows only the first pending approval decision to win", () => {
    const actions = source("src/app/app/approvals/actions.ts");
    expect(actions).toContain("id = $3 and status = 'pending'");
    expect(actions).toContain('.eq("status", "pending")');
    expect(source("src/app/app/approvals/page.tsx")).toContain('pendingLabel="Saving…"');
  });

  it("rejects blank or malformed baseline values without clearing the form", () => {
    const actions = source("src/app/app/reports/actions.ts");
    const form = source("src/app/app/reports/GrowthBaselineForm.tsx");
    expect(actions).toContain("if (!raw) return Number.NaN");
    expect(actions).toContain("Enter 0 only when the true value is zero");
    expect(form).toContain("useActionState");
    expect(form).toContain('role="alert"');
    expect(form).toContain('pendingLabel="Saving baseline…"');
  });
});
