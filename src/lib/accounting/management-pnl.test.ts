import { describe, expect, it } from "vitest";
import { buildManagementPnl } from "./management-pnl";

describe("buildManagementPnl", () => {
  it("keeps reconciliation-only records out of profit", () => {
    const report = buildManagementPnl({
      recognizedRevenueCents: 1_000_000,
      refundsCents: 50_000,
      directExpenseCents: 200_000,
      directLaborCents: 250_000,
      operatingExpenseCents: 100_000,
      operatingLaborCents: 75_000,
      paymentFeeCents: 25_000,
      salesTaxCents: 80_000,
      vendorBillsToReconcileCents: 300_000,
      materialLogsToReconcileCents: 125_000,
      unreviewedExpenseCents: 40_000
    });

    expect(report.netRevenueCents).toBe(950_000);
    expect(report.costOfRevenueCents).toBe(450_000);
    expect(report.grossProfitCents).toBe(500_000);
    expect(report.totalOperatingExpenseCents).toBe(200_000);
    expect(report.netOperatingIncomeCents).toBe(300_000);
  });

  it("allows a loss without hiding it", () => {
    const report = buildManagementPnl({
      recognizedRevenueCents: 100_000,
      refundsCents: 20_000,
      directExpenseCents: 90_000,
      directLaborCents: 30_000,
      operatingExpenseCents: 40_000,
      operatingLaborCents: 10_000,
      paymentFeeCents: 2_000,
      salesTaxCents: 0,
      vendorBillsToReconcileCents: 0,
      materialLogsToReconcileCents: 0,
      unreviewedExpenseCents: 0
    });

    expect(report.netOperatingIncomeCents).toBe(-92_000);
  });
});
