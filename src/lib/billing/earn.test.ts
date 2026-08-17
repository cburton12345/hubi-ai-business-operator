import { describe, expect, it } from "vitest";
import { calculateEarnCents, nextSettlementDate, rateForClassification } from "./earn";

describe("Ferocity Earn money math", () => {
  it("uses locked basis-point rates without floating-point percentage math", () => {
    expect(rateForClassification("CUSTOMER_ORIGINATED_FEROCITY_MANAGED")).toBe(90);
    expect(rateForClassification("FEROCITY_ORIGINATED")).toBe(600);
    expect(calculateEarnCents(500_000, 600)).toBe(30_000);
    expect(calculateEarnCents(900_000, 90)).toBe(8_100);
  });

  it("rounds deterministically to the nearest cent", () => {
    expect(calculateEarnCents(1, 600)).toBe(0);
    expect(calculateEarnCents(9, 600)).toBe(1);
    expect(calculateEarnCents(56, 90)).toBe(1);
  });

  it("rejects unsafe or negative money inputs", () => {
    expect(() => calculateEarnCents(-1, 600)).toThrow();
    expect(() => calculateEarnCents(Number.MAX_SAFE_INTEGER + 1, 600)).toThrow();
  });

  it("moves settlement to the next month after this month's day passes", () => {
    expect(nextSettlementDate(15, new Date("2026-08-16T00:00:00.000Z"))).toBe("2026-09-15T00:00:00.000Z");
  });
});
