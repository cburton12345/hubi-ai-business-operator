import { describe, expect, it } from "vitest";
import { calculateUsageCharge, usageIdempotencyKey } from "./billing-calculator";

describe("calculateUsageCharge", () => {
  it("separates included usage from billable overage", () => {
    const result = calculateUsageCharge({
      quantity: 120,
      includedRemaining: 100,
      providerCostCents: 240,
      percentageMarkupBps: 10000,
      minimumUnitPriceCents: 5
    });

    expect(result.includedQuantity).toBe(100);
    expect(result.billableQuantity).toBe(20);
    expect(result.customerChargeCents).toBe(100);
    expect(result.grossProfitCents).toBe(60);
  });

  it("uses the highest of provider markup, fixed markup, and minimum customer price", () => {
    const result = calculateUsageCharge({
      quantity: 10,
      providerCostCents: 10,
      fixedMarkupCents: 1,
      percentageMarkupBps: 2000,
      minimumUnitPriceCents: 4
    });

    expect(result.customerChargeCents).toBe(40);
    expect(result.grossProfitCents).toBe(30);
    expect(result.grossMarginBps).toBe(7500);
  });

  it("does not charge customer when usage is fully included", () => {
    const result = calculateUsageCharge({
      quantity: 25,
      includedRemaining: 50,
      providerCostCents: 12,
      percentageMarkupBps: 5000,
      minimumUnitPriceCents: 2
    });

    expect(result.billableQuantity).toBe(0);
    expect(result.customerChargeCents).toBe(0);
    expect(result.grossProfitCents).toBe(-12);
  });
});

describe("usageIdempotencyKey", () => {
  it("is stable for duplicate provider events", () => {
    const first = usageIdempotencyKey({
      tenantId: "tenant_a",
      providerKey: "retell_voice",
      providerEventId: "evt_123",
      unitType: "minute",
      sourceId: "call_123"
    });
    const second = usageIdempotencyKey({
      tenantId: "tenant_a",
      providerKey: "retell_voice",
      providerEventId: "evt_123",
      unitType: "minute",
      sourceId: "call_123"
    });

    expect(first).toBe(second);
  });

  it("keeps tenants separated even for identical provider event ids", () => {
    const a = usageIdempotencyKey({
      tenantId: "tenant_a",
      providerKey: "retell_voice",
      providerEventId: "evt_123",
      unitType: "minute"
    });
    const b = usageIdempotencyKey({
      tenantId: "tenant_b",
      providerKey: "retell_voice",
      providerEventId: "evt_123",
      unitType: "minute"
    });

    expect(a).not.toBe(b);
  });
});
