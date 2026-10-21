import { describe, expect, it } from "vitest";
import { discoverRelevantCapabilities } from "./capability-discovery";

const allAvailable = { hasGrowthController: true, hasActiveGrowthObjective: false, hasExpenseIntelligence: true, hasImportedExpenseDocuments: false, hasFerocityConnect: true, hasPairedAndroidDevice: false };

describe("contextual capability discovery", () => {
  it("recommends only tools relevant to the stated bottleneck", () => {
    const results = discoverRelevantCapabilities("We need to text old leads and follow up faster", allAvailable);
    expect(results[0].key).toBe("ferocity_connect");
    expect(results.some((item) => item.key === "expense_intelligence")).toBe(false);
  });

  it("offers a small setup set instead of dumping the catalog", () => {
    const results = discoverRelevantCapabilities("Set Ferocity up for my business", allAvailable);
    expect(results).toHaveLength(3);
  });

  it("does not recommend capabilities already configured", () => {
    const results = discoverRelevantCapabilities("Help with growth, texting, and expenses", { ...allAvailable, hasActiveGrowthObjective: true, hasImportedExpenseDocuments: true, hasPairedAndroidDevice: true });
    expect(results.some((item) => item.key === "growth_controller")).toBe(false);
    expect(results.some((item) => item.key === "expense_intelligence")).toBe(false);
    expect(results.some((item) => item.key === "ferocity_connect")).toBe(false);
  });

  it("routes distinct business problems beyond the original three products", () => {
    expect(discoverRelevantCapabilities("Our crews are missing job handoffs", allAvailable)[0].key).toBe("jobs_operations");
    expect(discoverRelevantCapabilities("Customers owe us on overdue invoices", allAvailable)[0].key).toBe("cash_collection");
    expect(discoverRelevantCapabilities("I need calls answered and transferred to a human", allAvailable)[0].key).toBe("phone_office");
    expect(discoverRelevantCapabilities("Our employees and timesheets are a mess", allAvailable)[0].key).toBe("workforce");
  });

  it("keeps broad setup guidance small but cross-functional", () => {
    const results = discoverRelevantCapabilities("Check everything and help set Ferocity up", allAvailable);
    expect(results).toHaveLength(3);
    expect(new Set(results.map((item) => item.key)).size).toBe(3);
  });

  it("does not confuse reviewing financial documents with reputation reviews", () => {
    const results = discoverRelevantCapabilities(
      "How many financial documents need review? Do not change anything.",
      { ...allAvailable, hasImportedExpenseDocuments: true },
    );
    expect(results.some((item) => item.key === "local_presence")).toBe(false);
  });
});
