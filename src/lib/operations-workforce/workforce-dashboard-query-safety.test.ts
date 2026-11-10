import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("workforce dashboard daily-hours query",() => {
  it("closes the aggregate before the time-entry FROM clause",() => {
    const source=readFileSync("src/lib/operations-workforce/get-operations-workforce-dashboard.ts","utf8").replace(/\r\n/g,"\n");
    expect(source).toContain("end))/3600.0)\n          from public.operations_time_entries entry");
  });
});
