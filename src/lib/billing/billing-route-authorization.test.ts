import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("billing route authorization", () => {
  it("requires billing permission before opening Stripe's customer portal", () => {
    expect(read("../../app/api/billing/portal/route.ts")).toContain('requirePermission("billing:manage")');
  });

  it("requires billing permission before creating usage invoice items", () => {
    expect(read("../../app/api/billing/usage/sync/route.ts")).toContain('requirePermission("billing:manage")');
  });

  it("requires billing permission before changing an existing workspace plan", () => {
    const source = read("../../app/api/billing/checkout/route.ts");
    expect(source).toContain('if (workspace)');
    expect(source).toContain('requirePermission("billing:manage")');
  });
});
