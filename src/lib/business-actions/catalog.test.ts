import { describe, expect, it } from "vitest";
import {
  businessActionCatalog,
  listBusinessActionDefinitions,
} from "@/lib/business-actions/catalog";

describe("provider-neutral business action catalog", () => {
  it("covers the core business context and action surface", () => {
    expect(Object.keys(businessActionCatalog)).toEqual(
      expect.arrayContaining([
        "getOpenLeads",
        "getStaleLeads",
        "getUnsoldEstimates",
        "getCustomerHistory",
        "getScheduleAvailability",
        "getJobStatus",
        "createFollowUp",
        "updateJob",
        "scheduleJob",
        "requestApproval",
        "getOutstandingInvoices",
        "getOpenCommitments",
        "createCommitment",
      ]),
    );
  });

  it("keeps consequential mutations behind the approval surface", () => {
    expect(businessActionCatalog.updateJob.mode).toBe("prepare_for_approval");
    expect(businessActionCatalog.scheduleJob.mode).toBe("prepare_for_approval");
    expect(businessActionCatalog.requestApproval.mode).toBe(
      "prepare_for_approval",
    );
  });

  it("does not certify outside-agent compatibility before authentication and testing", () => {
    expect(
      listBusinessActionDefinitions().every(
        (definition) => !definition.externalReady,
      ),
    ).toBe(true);
  });
});
