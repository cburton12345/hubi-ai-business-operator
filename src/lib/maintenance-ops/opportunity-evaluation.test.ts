import { describe, expect, it } from "vitest";
import { evaluateMaintenanceOpportunity, type MaintenanceOperatingPolicy, type MaintenanceOpportunityInput } from "./opportunity-evaluation";

const policy: MaintenanceOperatingPolicy = {
  minimumMarginBps: 1500,
  minimumContributionCents: 0,
  maximumAutomaticCustomerValueCents: 250000,
  maximumAutomaticContractorCostCents: 175000,
  maximumAutomaticComplexity: 35,
  managerEscalationValueCents: 250000,
  ownerEscalationValueCents: 1000000,
  autoSourcingEnabled: true,
  autoWorkOrderCreationEnabled: false,
  requireCustomerAuthorization: true,
  requireContractorConfirmation: true,
  requireInsuranceVerification: true,
  requireLicenseVerification: true,
};

const opportunity: MaintenanceOpportunityInput = {
  opportunityId: "3b21bb5f-e058-4683-bce2-3be681ed48e8",
  classification: "commercial_maintenance",
  customerId: "3b21bb5f-e058-4683-bce2-3be681ed48e9",
  locationId: "3b21bb5f-e058-4683-bce2-3be681ed48ea",
  city: "Milwaukee",
  state: "WI",
  trade: "plumbing",
  scope: "Repair an active plumbing leak.",
  deadlineAt: "2099-01-01T17:00:00.000Z",
  customerBudgetCents: 45000,
  expectedContractorCostCents: 30000,
  materialsAllowanceCents: 0,
  additionalCostCents: 0,
  paymentTermsDays: 30,
  complexityScore: 20,
  callbackRiskScore: 20,
  licensingRequired: true,
  insuranceRequired: true,
  licensingVerified: false,
  insuranceVerified: false,
  customerAuthorized: false,
  contractorConfirmed: false,
};

describe("maintenance opportunity evaluation", () => {
  it("allows profitable small jobs into sourcing without an arbitrary minimum", () => {
    const result = evaluateMaintenanceOpportunity(opportunity, policy);
    expect(result.grossContributionCents).toBe(15000);
    expect(result.grossMarginBps).toBe(3333);
    expect(result.sourceReady).toBe(true);
    expect(result.workOrderReady).toBe(false);
    expect(result.recommendedAction).toBe("source_contractors");
  });

  it("fails closed before binding work-order creation", () => {
    const result = evaluateMaintenanceOpportunity({
      ...opportunity,
      licensingVerified: true,
      insuranceVerified: true,
      customerAuthorized: true,
      contractorConfirmed: true,
    }, policy);
    expect(result.workOrderReady).toBe(false);
    expect(result.blockerCodes).toEqual([]);
    expect(result.classification).toBe("suitable");
  });

  it("creates no maintenance action for generic sales or system records", () => {
    const result = evaluateMaintenanceOpportunity({ ...opportunity, classification: "other_business" }, policy);
    expect(result.classification).toBe("unsuitable");
    expect(result.sourceReady).toBe(false);
    expect(result.recommendedAction).toBe("decline");
  });

  it("rejects negative contribution and escalates high exposure", () => {
    const result = evaluateMaintenanceOpportunity({
      ...opportunity,
      customerBudgetCents: 1_200_000,
      expectedContractorCostCents: 1_300_000,
    }, policy);
    expect(result.classification).toBe("unsuitable");
    expect(result.blockerCodes).toContain("cost_exceeds_customer_budget");
    expect(result.interventionLevel).toBe("owner");
  });
});
