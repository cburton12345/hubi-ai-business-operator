export const MAINTENANCE_EVALUATION_VERSION = "2026-11-15.1";

export type MaintenanceOperatingPolicy = {
  minimumMarginBps: number;
  minimumContributionCents: number;
  maximumAutomaticCustomerValueCents: number;
  maximumAutomaticContractorCostCents: number;
  maximumAutomaticComplexity: number;
  managerEscalationValueCents: number;
  ownerEscalationValueCents: number;
  autoSourcingEnabled: boolean;
  autoWorkOrderCreationEnabled: boolean;
  requireCustomerAuthorization: boolean;
  requireContractorConfirmation: boolean;
  requireInsuranceVerification: boolean;
  requireLicenseVerification: boolean;
};

export type MaintenanceOpportunityInput = {
  opportunityId: string;
  classification: "unclassified" | "commercial_maintenance" | "other_business" | "non_opportunity";
  customerId: string | null;
  locationId: string | null;
  city: string | null;
  state: string | null;
  trade: string | null;
  scope: string | null;
  deadlineAt: string | null;
  customerBudgetCents: number | null;
  expectedContractorCostCents: number | null;
  materialsAllowanceCents: number;
  additionalCostCents: number;
  paymentTermsDays: number | null;
  complexityScore: number | null;
  callbackRiskScore: number | null;
  licensingRequired: boolean;
  insuranceRequired: boolean;
  licensingVerified: boolean;
  insuranceVerified: boolean;
  customerAuthorized: boolean;
  contractorConfirmed: boolean;
};

export type MaintenanceOpportunityEvaluation = {
  classification: "suitable" | "needs_information" | "unsuitable";
  grossContributionCents: number | null;
  grossMarginBps: number | null;
  riskScore: number;
  blockerCodes: string[];
  warningCodes: string[];
  recommendedAction: "classify" | "collect_information" | "decline" | "source_contractors" | "manager_review" | "owner_review" | "create_work_order";
  sourceReady: boolean;
  workOrderReady: boolean;
  interventionLevel: "none" | "manager" | "owner";
};

function finiteInteger(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value as number) : fallback;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function evaluateMaintenanceOpportunity(
  input: MaintenanceOpportunityInput,
  policy: MaintenanceOperatingPolicy,
): MaintenanceOpportunityEvaluation {
  if (input.classification !== "commercial_maintenance") {
    return {
      classification: input.classification === "unclassified" ? "needs_information" : "unsuitable",
      grossContributionCents: null,
      grossMarginBps: null,
      riskScore: 0,
      blockerCodes: [input.classification === "unclassified" ? "classification_required" : "not_commercial_maintenance"],
      warningCodes: [],
      recommendedAction: input.classification === "unclassified" ? "classify" : "decline",
      sourceReady: false,
      workOrderReady: false,
      interventionLevel: "none",
    };
  }

  const missing: string[] = [];
  if (!input.customerId) missing.push("customer_required");
  if (!input.locationId) missing.push("location_required");
  if (!input.city || !input.state) missing.push("service_area_required");
  if (!input.trade) missing.push("trade_required");
  if (!input.scope) missing.push("scope_required");
  if (!input.deadlineAt) missing.push("deadline_required");
  if (input.customerBudgetCents === null) missing.push("customer_budget_required");
  if (input.expectedContractorCostCents === null) missing.push("contractor_cost_required");
  if (input.complexityScore === null) missing.push("complexity_required");
  if (input.callbackRiskScore === null) missing.push("callback_risk_required");
  if (input.paymentTermsDays === null) missing.push("payment_terms_required");

  const budget = input.customerBudgetCents;
  const directCost = input.expectedContractorCostCents === null
    ? null
    : finiteInteger(input.expectedContractorCostCents)
      + finiteInteger(input.materialsAllowanceCents)
      + finiteInteger(input.additionalCostCents);
  const grossContributionCents = budget === null || directCost === null ? null : finiteInteger(budget) - directCost;
  const grossMarginBps = budget && grossContributionCents !== null
    ? Math.round((grossContributionCents / budget) * 10_000)
    : null;

  const financialBlockers: string[] = [];
  if (grossContributionCents !== null && grossContributionCents < policy.minimumContributionCents) {
    financialBlockers.push("contribution_below_policy");
  }
  if (grossMarginBps !== null && grossMarginBps < policy.minimumMarginBps) {
    financialBlockers.push("margin_below_policy");
  }
  if (budget !== null && directCost !== null && directCost > budget) {
    financialBlockers.push("cost_exceeds_customer_budget");
  }

  const warnings: string[] = [];
  const complexity = finiteInteger(input.complexityScore);
  const callbackRisk = finiteInteger(input.callbackRiskScore);
  const paymentRisk = input.paymentTermsDays === null ? 0 : Math.min(100, Math.round(input.paymentTermsDays * 1.5));
  const riskScore = Math.max(0, Math.min(100, Math.round(complexity * 0.45 + callbackRisk * 0.4 + paymentRisk * 0.15)));
  if (input.deadlineAt && Date.parse(input.deadlineAt) <= Date.now()) warnings.push("deadline_due_or_past");
  if (input.paymentTermsDays !== null && input.paymentTermsDays > 60) warnings.push("extended_payment_terms");
  if (complexity > policy.maximumAutomaticComplexity) warnings.push("complexity_exceeds_automatic_limit");
  if (callbackRisk >= 70) warnings.push("high_callback_risk");

  const complianceBlockers: string[] = [];
  if (policy.requireLicenseVerification && input.licensingRequired && !input.licensingVerified) {
    complianceBlockers.push("license_verification_required");
  }
  if (policy.requireInsuranceVerification && input.insuranceRequired && !input.insuranceVerified) {
    complianceBlockers.push("insurance_verification_required");
  }
  if (policy.requireCustomerAuthorization && !input.customerAuthorized) {
    complianceBlockers.push("customer_authorization_required");
  }
  if (policy.requireContractorConfirmation && !input.contractorConfirmed) {
    complianceBlockers.push("contractor_confirmation_required");
  }

  const customerValue = finiteInteger(input.customerBudgetCents);
  const contractorCost = finiteInteger(input.expectedContractorCostCents);
  const interventionLevel = customerValue >= policy.ownerEscalationValueCents
    ? "owner"
    : customerValue >= policy.managerEscalationValueCents
      || customerValue > policy.maximumAutomaticCustomerValueCents
      || contractorCost > policy.maximumAutomaticContractorCostCents
      || complexity > policy.maximumAutomaticComplexity
      || riskScore >= 70
        ? "manager"
        : "none";

  const sourceReady = policy.autoSourcingEnabled
    && missing.every((code) => !["customer_required", "service_area_required", "trade_required", "scope_required", "deadline_required", "customer_budget_required", "contractor_cost_required"].includes(code))
    && financialBlockers.length === 0;
  const workOrderReady = policy.autoWorkOrderCreationEnabled
    && sourceReady
    && missing.length === 0
    && complianceBlockers.length === 0
    && warnings.every((code) => code !== "deadline_due_or_past")
    && interventionLevel === "none";

  const blockers = unique([...missing, ...financialBlockers, ...complianceBlockers]);
  if (financialBlockers.length > 0) {
    return { classification: "unsuitable", grossContributionCents, grossMarginBps, riskScore, blockerCodes: blockers, warningCodes: unique(warnings), recommendedAction: "decline", sourceReady: false, workOrderReady: false, interventionLevel };
  }
  if (workOrderReady) {
    return { classification: "suitable", grossContributionCents, grossMarginBps, riskScore, blockerCodes: [], warningCodes: unique(warnings), recommendedAction: "create_work_order", sourceReady, workOrderReady, interventionLevel };
  }
  const recommendedAction = interventionLevel === "owner"
    ? "owner_review"
    : interventionLevel === "manager"
      ? "manager_review"
      : sourceReady && !input.contractorConfirmed
        ? "source_contractors"
        : "collect_information";
  return {
    classification: blockers.length === 0 ? "suitable" : "needs_information",
    grossContributionCents,
    grossMarginBps,
    riskScore,
    blockerCodes: blockers,
    warningCodes: unique(warnings),
    recommendedAction,
    sourceReady,
    workOrderReady,
    interventionLevel,
  };
}
