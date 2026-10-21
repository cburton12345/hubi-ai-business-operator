import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("POS interactive action safety", () => {
  it("uses result-bearing atomic transactions so business failures reach the operator", () => {
    const actions = source("src/app/app/pos/actions.ts");
    expect(actions).toContain("withPostgresTransactionResult");
    expect(actions).toContain("No partial sale was saved; your entries are still here");
    expect(actions).toContain("No partial return was saved; your entries are still here");
    expect(actions).toContain('message.startsWith("Insufficient inventory for ")');
  });

  it("keeps forms pending-safe and renders action errors in place", () => {
    for (const path of [
      "src/app/app/pos/PosTerminal.tsx",
      "src/app/app/pos/sales/[saleId]/ReturnForm.tsx"
    ]) {
      const component = source(path);
      expect(component).toContain("useActionState");
      expect(component).toContain("pending");
      expect(component).toContain('role="alert"');
    }
  });
});
