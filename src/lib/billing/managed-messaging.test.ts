import { describe, expect, it } from "vitest";
import { includedManagedSmsSegments, managedSmsOverageUnits } from "./managed-messaging";

describe("managed messaging allowances", () => {
  it("keeps Connect and BYO economics separate from managed hosted SMS", () => {
    expect(includedManagedSmsSegments("ferocity_connect")).toBe(0);
    expect(includedManagedSmsSegments("starter")).toBe(100);
    expect(includedManagedSmsSegments("growth")).toBe(300);
    expect(includedManagedSmsSegments("operator")).toBe(1000);
  });

  it("charges only the portion above the plan allowance", () => {
    expect(managedSmsOverageUnits({ planKey: "starter", usedBefore: 98, newUnits: 4 })).toBe(2);
    expect(managedSmsOverageUnits({ planKey: "growth", usedBefore: 250, newUnits: 2 })).toBe(0);
    expect(managedSmsOverageUnits({ planKey: "earn", usedBefore: 0, newUnits: 2 })).toBe(2);
  });
});
