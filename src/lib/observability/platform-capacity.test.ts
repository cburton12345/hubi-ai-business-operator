import { describe, expect, it } from "vitest";
import { capacitySeverity, countSeverity } from "./platform-capacity";

describe("platform capacity thresholds", () => {
  it("uses the launch 50/70/85 percent alert bands", () => {
    expect(capacitySeverity(49.9)).toBe("healthy");
    expect(capacitySeverity(50)).toBe("watch");
    expect(capacitySeverity(70)).toBe("high");
    expect(capacitySeverity(85)).toBe("critical");
  });

  it("does not claim health when the metric is unavailable", () => {
    expect(capacitySeverity(null)).toBe("unknown");
    expect(capacitySeverity(Number.NaN)).toBe("unknown");
  });

  it("classifies queue and error counts at configurable thresholds", () => {
    const thresholds = { watch: 10, high: 50, critical: 200 };
    expect(countSeverity(9, thresholds)).toBe("healthy");
    expect(countSeverity(10, thresholds)).toBe("watch");
    expect(countSeverity(50, thresholds)).toBe("high");
    expect(countSeverity(200, thresholds)).toBe("critical");
  });
});
