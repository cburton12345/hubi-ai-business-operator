import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("service actions use the canonical lifecycle transitions", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/service/actions.ts"), "utf8");

  it("routes estimate-to-job and job-to-invoice through the shared lifecycle service", () => {
    expect(source).toContain("convertEstimateToJob({");
    expect(source).toContain("createInvoiceFromJob({");
    expect(source).toContain("recordManualInvoicePayment({");
    expect(source).toContain("sourceLeadId: transition.sourceLeadId");
  });
});
