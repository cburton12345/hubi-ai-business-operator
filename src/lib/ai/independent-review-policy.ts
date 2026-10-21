export type IndependentReviewDomain =
  | "financial_document"
  | "tax"
  | "payroll"
  | "payment"
  | "legal_compliance"
  | "safety"
  | "public_publishing"
  | "advertising_spend"
  | "customer_communication"
  | "destructive_change"
  | "routine";

export type IndependentReviewTier = "standard" | "important" | "critical";

const criticalDomains = new Set<IndependentReviewDomain>([
  "tax", "payroll", "payment", "legal_compliance", "safety",
  "advertising_spend", "destructive_change",
]);

const importantDomains = new Set<IndependentReviewDomain>([
  "financial_document", "public_publishing", "customer_communication",
]);

export function independentReviewTier(domain: IndependentReviewDomain): IndependentReviewTier {
  if (criticalDomains.has(domain)) return "critical";
  if (importantDomains.has(domain)) return "important";
  return "standard";
}

export function independentReviewRequirements(domain: IndependentReviewDomain) {
  const tier = independentReviewTier(domain);
  return {
    tier,
    deterministicChecksRequired: tier !== "standard",
    independentModelRequired: tier !== "standard",
    humanApprovalRequired: tier === "critical",
    externalExecutionBlockedOnDisagreement: tier !== "standard",
  };
}
