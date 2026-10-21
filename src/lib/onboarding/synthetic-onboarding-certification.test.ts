import { describe, expect, it } from "vitest";
import { evaluateCustomerOnboardingSignals, type OnboardingSignals } from "@/lib/onboarding/customer-onboarding";

function signals(overrides: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    tenant_name: "Synthetic Home Services",
    onboarding_status: "in_progress",
    brand_id: null,
    brand_name: null,
    industry: null,
    business_model: null,
    description: null,
    primary_goal: null,
    approval_mode: null,
    authority_confirmations: 0,
    connected_providers: [],
    verified_receipts: 0,
    operational_records: 0,
    first_value_evidence: null,
    connection_issues: [],
    ...overrides,
  };
}

describe("synthetic autonomous customer onboarding certification", () => {
  it("advances from minimum context to connection to discovery to verified first value without false completion", () => {
    const empty = evaluateCustomerOnboardingSignals(signals());
    expect(empty).toMatchObject({ businessContextComplete: false, authorityComplete: false, complete: false });
    expect(empty.recommendations[0]?.capability).toBe("communications");

    const contextual = evaluateCustomerOnboardingSignals(signals({
      brand_id: "10000000-0000-4000-8000-000000000001",
      brand_name: "Synthetic Home Services",
      industry: "home services",
      business_model: "local_service",
      description: "Repairs homes and books appointments",
      primary_goal: "Reduce missed calls and fill the schedule",
      approval_mode: "low_risk_auto",
      authority_confirmations: 1,
    }));
    expect(contextual).toMatchObject({ businessContextComplete: true, authorityComplete: true, primaryConnectionComplete: false, complete: false });
    expect(contextual.recommendations.map((item) => item.capability)).toEqual(expect.arrayContaining(["communications", "calendar", "phone"]));

    const connected = evaluateCustomerOnboardingSignals(signals({
      brand_id: "10000000-0000-4000-8000-000000000001",
      brand_name: "Synthetic Home Services",
      industry: "home services",
      business_model: "local_service",
      description: "Repairs homes and books appointments",
      primary_goal: "Reduce missed calls and fill the schedule",
      approval_mode: "low_risk_auto",
      authority_confirmations: 1,
      connected_providers: ["gmail_mailbox"],
    }));
    expect(connected).toMatchObject({ primaryConnectionComplete: true, discoveryComplete: false, firstValueReached: false, complete: false });

    const discovered = evaluateCustomerOnboardingSignals(signals({
      brand_id: "10000000-0000-4000-8000-000000000001",
      brand_name: "Synthetic Home Services",
      industry: "home services",
      business_model: "local_service",
      description: "Repairs homes and books appointments",
      primary_goal: "Reduce missed calls and fill the schedule",
      approval_mode: "low_risk_auto",
      authority_confirmations: 1,
      connected_providers: ["gmail_mailbox"],
      operational_records: 12,
      verified_receipts: 1,
      first_value_evidence: {
        receiptId: "receipt-1",
        title: "Prepared first customer follow-up",
        href: "/app/service/customers/customer-1",
        targetTable: "customers",
        targetId: "customer-1",
      },
    }));
    expect(discovered).toMatchObject({ discoveryComplete: true, firstValueReached: true, complete: true });
  });
});
