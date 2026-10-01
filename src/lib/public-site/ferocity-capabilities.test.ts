import { describe, expect, it } from "vitest";
import {
  publicFerocityCapabilityKnowledge,
  resolvePublicFerocityCapabilities,
} from "./ferocity-capabilities";

describe("public Ferocity capability guidance", () => {
  it("maps model-selected keys to server-owned safe links", () => {
    expect(resolvePublicFerocityCapabilities(["money_profit", "growth_revenue"])).toEqual([
      expect.objectContaining({ key: "growth_revenue", href: "/features" }),
      expect.objectContaining({ key: "money_profit", href: "/features" }),
    ]);
  });

  it("rejects invented keys and limits the result", () => {
    const result = resolvePublicFerocityCapabilities([
      "private_admin",
      "business_operator",
      "growth_revenue",
      "marketing",
      "money_profit",
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((item) => String(item.key))).not.toContain("private_admin");
  });

  it("publishes outcomes without private routes or implementation detail", () => {
    const serialized = JSON.stringify(publicFerocityCapabilityKnowledge());
    expect(serialized).not.toContain("/app/");
    expect(serialized).not.toContain("prompt");
  });
});
