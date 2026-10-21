import { describe, expect, it } from "vitest";
import { countReturnedRecords, evaluateExternalAiUsage } from "@/lib/mcp/usage-policy";

describe("external AI usage policy", () => {
  const limits = { dailyRequestLimit: 500, dailyRecordLimit: 2500 };

  it("allows ordinary use and detects bursty assistant loops", () => {
    expect(evaluateExternalAiUsage({ requestCount: 12, returnedRecordCount: 50, recentRequestCount: 2 }, limits)).toEqual({ allowed: true, code: null, notifyOwner: false });
    expect(evaluateExternalAiUsage({ requestCount: 90, returnedRecordCount: 50, recentRequestCount: 80 }, limits).notifyOwner).toBe(true);
  });

  it("enforces both daily ceilings", () => {
    expect(evaluateExternalAiUsage({ requestCount: 500, returnedRecordCount: 0, recentRequestCount: 0 }, limits).code).toBe("DAILY_REQUEST_LIMIT_REACHED");
    expect(evaluateExternalAiUsage({ requestCount: 1, returnedRecordCount: 2500, recentRequestCount: 0 }, limits).code).toBe("DAILY_RECORD_LIMIT_REACHED");
  });

  it("counts only top-level business records, not nested fields", () => {
    expect(countReturnedRecords({ items: [{ id: 1 }, { id: 2 }] })).toBe(2);
    expect(countReturnedRecords({ business: { id: 1, secrets: [1, 2] } })).toBe(1);
    expect(countReturnedRecords({ message: "done" })).toBe(0);
  });
});
