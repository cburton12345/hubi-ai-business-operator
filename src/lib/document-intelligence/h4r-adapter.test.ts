import { describe, expect, it } from "vitest";
import { buildH4rAllocationTargets } from "./h4r-adapter";

describe("H4R expense adapter", () => {
  it("exposes property, unit, lease, maintenance, and tax targets without Ferocity schema coupling", () => {
    const targets = buildH4rAllocationTargets({
      properties: [{ id: "p1", label: "Oak Duplex", address: "10 Oak St" }],
      units: [{ id: "u1", label: "Unit A", propertyId: "p1", propertyLabel: "Oak Duplex", tenantNames: ["Taylor"] }],
      leases: [{ id: "l1", label: "Taylor lease", propertyLabel: "Oak Duplex", unitLabel: "Unit A", tenantNames: ["Taylor"] }],
      openMaintenance: [{ id: "m1", label: "Replace sink", propertyLabel: "Oak Duplex", unitLabel: "Unit A" }]
    });
    expect(targets.map((target) => target.type)).toEqual(expect.arrayContaining(["property", "unit", "lease", "maintenance", "capex", "taxes"]));
    expect(targets.find((target) => target.type === "unit")?.metadata).toEqual({ propertyId: "p1", unitId: "u1" });
  });
});
