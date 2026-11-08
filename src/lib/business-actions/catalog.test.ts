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
        "getMarketplaceProContractorSourcing",
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

  it("certifies only the narrow MCP action set for stored external grants", () => {
    const external = listBusinessActionDefinitions().filter((definition) => definition.externalReady).map((definition) => definition.key);
    expect(external).toEqual(expect.arrayContaining([
      "getBusinessSummary", "listCustomers", "getCustomerHistory", "listJobs", "getJobStatus",
      "listInvoices", "getOpenCommitments", "createCommitment", "updateCommitment", "startWorkflow",
    ]));
    expect(businessActionCatalog.scheduleJob.externalReady).toBe(false);
    expect(businessActionCatalog.updateJob.externalReady).toBe(false);
    expect(businessActionCatalog.requestApproval.externalReady).toBe(false);
  });
});
