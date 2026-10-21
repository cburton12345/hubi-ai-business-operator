import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authoritativeReaders = [
  "src/lib/dashboard/get-dashboard-snapshot.ts",
  "src/lib/dashboard/get-today-overview.ts",
  "src/lib/document-intelligence/dashboard.ts",
  "src/lib/reports/get-reporting-dashboard.ts",
  "src/lib/reports/expense-tax-packet.ts",
  "src/lib/cash-collection/get-cash-collection-dashboard.ts",
  "src/lib/job-tracker/get-job-tracker-dashboard.ts",
  "src/lib/scheduling/get-schedule-dashboard.ts",
  "src/lib/service-ops/get-service-ops-dashboard.ts",
  "src/lib/service-ops/get-customer-detail.ts",
  "src/lib/service-ops/get-customer-portal.ts",
  "src/lib/service-ops/get-public-estimate.ts",
  "src/lib/service-ops/get-service-record-detail.ts",
  "src/lib/service-ops/get-service-inventory.ts",
  "src/lib/service-ops/get-pricebook.ts",
  "src/lib/revenue-growth/get-revenue-growth-dashboard.ts",
  "src/lib/growth/get-growth-operator.ts",
  "src/lib/operations-workforce/get-operations-workforce-dashboard.ts",
  "src/lib/employee/get-employee-workday.ts",
  "src/lib/onboarding/get-workspace-onboarding.ts",
  "src/lib/integrations/get-integrations.ts",
  "src/lib/business-brain/get-business-brain.ts",
  "src/lib/owner-command-center/get-owner-command-center.ts",
  "src/lib/operator/get-operator-console.ts",
  "src/lib/messaging/get-messaging-dashboard.ts",
  "src/app/api/reports/accounting-export/route.ts",
  "src/app/api/reports/profit-loss/route.ts",
  "src/app/app/reports/income-tax-print/page.tsx",
] as const;

describe("authoritative database read contract", () => {
  it.each(authoritativeReaders)("does not convert database outages into empty data in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).toMatch(/queryPostgresRequired/);
    expect(source).not.toMatch(/import\s*\{\s*queryPostgres\s*\}\s*from\s*["']@\/lib\/db\/postgres["']/);
  });
});
