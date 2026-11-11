import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schedules = [
  { file: "run-document-email-recovery.ts", cron: "3,18,33,48 * * * *", scheduledRuns: 96, dispatchesBackground: false },
  { file: "run-calendar-sync.ts", cron: "8,38 * * * *", scheduledRuns: 48, dispatchesBackground: true },
  { file: "run-conversion-feedback.ts", cron: "13 * * * *", scheduledRuns: 24, dispatchesBackground: true },
  { file: "run-mailbox-sync.ts", cron: "*/15 * * * *", scheduledRuns: 96, dispatchesBackground: true },
  { file: "run-business-automation.ts", cron: "23 * * * *", scheduledRuns: 24, dispatchesBackground: true },
  { file: "run-weather-demand-monitor.ts", cron: "37 */6 * * *", scheduledRuns: 4, dispatchesBackground: true },
] as const;

describe("Netlify scheduled-function credit budget", () => {
  it("keeps recurring operational work staggered and below 500 function invocations per day", () => {
    for (const schedule of schedules) {
      const source = readFileSync(join(process.cwd(), "netlify/functions", schedule.file), "utf8");
      expect(source).toContain(`schedule: "${schedule.cron}"`);
    }

    const dailyInvocations = schedules.reduce(
      (total, schedule) => total + schedule.scheduledRuns * (schedule.dispatchesBackground ? 2 : 1),
      0,
    );
    expect(dailyInvocations).toBe(488);
    expect(dailyInvocations).toBeLessThanOrEqual(500);
  });
});
