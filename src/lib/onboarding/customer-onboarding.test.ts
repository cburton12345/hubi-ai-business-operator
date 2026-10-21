import { describe, expect, it } from "vitest";
import {
  evaluateCustomerOnboardingSignals,
  buildCustomerOnboardingResumePlan,
  normalizeFirstValueEvidence,
  normalizeOnboardingConnectionIssues,
  recommendOnboardingConnections,
  type OnboardingSignals,
} from "./customer-onboarding";

function signals(overrides: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    tenant_name: "Example Business",
    onboarding_status: "in_progress",
    brand_id: "brand-1",
    brand_name: "Example Business",
    industry: "Home services",
    business_model: "Local service business",
    description: "Repairs homes for local customers",
    primary_goal: "Respond to leads faster",
    approval_mode: "review_required",
    authority_confirmations: 1,
    connected_providers: [],
    verified_receipts: 0,
    operational_records: 0,
    first_value_evidence: null,
    connection_issues: [],
    ...overrides,
  };
}

describe("recommendOnboardingConnections", () => {
  it("always begins with a read-only communication discovery path", () => {
    const result = recommendOnboardingConnections({ industry: "Accounting" });
    expect(result[0]).toMatchObject({ capability: "communications" });
    expect(result[0].providers).toEqual(["gmail_mailbox", "microsoft_mailbox"]);
  });

  it("selects contextual systems instead of asking every customer for every integration", () => {
    const result = recommendOnboardingConnections({
      industry: "Home services",
      primaryGoal: "Book more appointments, answer calls, and manage paid lead campaigns",
    });
    expect(result.map((item) => item.capability)).toEqual(["communications", "calendar", "crm", "phone"]);
  });

  it("does not mistake an OAuth connection for completed discovery or first value", () => {
    const result = evaluateCustomerOnboardingSignals(signals({ connected_providers: ["gmail_mailbox"] }));
    expect(result.primaryConnectionComplete).toBe(true);
    expect(result.discoveryComplete).toBe(false);
    expect(result.firstValueReached).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("does not mistake an existing record for a finished first result", () => {
    const result = evaluateCustomerOnboardingSignals(signals({
      connected_providers: ["gmail_mailbox"],
      operational_records: 4,
    }));
    expect(result.primaryConnectionComplete).toBe(true);
    expect(result.discoveryComplete).toBe(true);
    expect(result.firstValueReached).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("completes only with an openable result tied to an authoritative record", () => {
    const result = evaluateCustomerOnboardingSignals(signals({
      connected_providers: ["gmail_mailbox"],
      operational_records: 4,
      verified_receipts: 1,
      first_value_evidence: {
        receiptId: "receipt-1",
        title: "Imported customer ready",
        href: "/app/service/customers/customer-1",
        targetTable: "customers",
        targetId: "customer-1",
      },
    }));
    expect(result.discoveryComplete).toBe(true);
    expect(result.firstValueReached).toBe(true);
    expect(result.firstValueEvidence?.href).toBe("/app/service/customers/customer-1");
    expect(result.complete).toBe(true);
  });

  it("does not complete without business context or authority preferences", () => {
    const result = evaluateCustomerOnboardingSignals(signals({
      description: null,
      primary_goal: null,
      approval_mode: null,
      authority_confirmations: 0,
      connected_providers: ["gmail_mailbox"],
      verified_receipts: 1,
      first_value_evidence: {
        receiptId: "receipt-1",
        title: "Verified result",
        href: "/app/service/customers/customer-1",
        targetTable: "customers",
        targetId: "customer-1",
      },
    }));
    expect(result.firstValueReached).toBe(true);
    expect(result.businessContextComplete).toBe(false);
    expect(result.authorityComplete).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("does not treat provisioned approval defaults as owner authority consent", () => {
    const result = evaluateCustomerOnboardingSignals(signals({
      approval_mode: "low_risk_auto",
      authority_confirmations: 0,
    }));
    expect(result.authorityComplete).toBe(false);
  });

  it("allows a customer to start with native business records instead of OAuth", () => {
    const result = evaluateCustomerOnboardingSignals(signals({ operational_records: 1 }));
    expect(result.primaryConnectionComplete).toBe(true);
    expect(result.firstValueReached).toBe(false);
    expect(result.discoveryComplete).toBe(true);
    expect(result.complete).toBe(false);
  });

  it("rejects placeholder or off-site first-value links", () => {
    expect(normalizeFirstValueEvidence({
      receiptId: "receipt-1",
      title: "Generic completion",
      href: "/app/ferocity",
      targetTable: "",
      targetId: "",
    })).toBeNull();
    expect(normalizeFirstValueEvidence({
      receiptId: "receipt-2",
      title: "External redirect",
      href: "https://example.com/result",
      targetTable: "customers",
      targetId: "customer-1",
    })).toBeNull();
  });

  it("normalizes missing-scope recovery without duplicating provider issues", () => {
    expect(normalizeOnboardingConnectionIssues([
      { provider: "gmail_mailbox", status: "connected", credentialsStatus: "configured", scopeVerificationStatus: "insufficient", missingScopes: ["gmail.readonly"] },
      { provider: "gmail_mailbox", status: "connected", credentialsStatus: "configured", scopeVerificationStatus: "insufficient", missingScopes: ["gmail.readonly"] },
      { provider: "google_calendar", status: "disconnected", credentialsStatus: "configured" },
    ])).toEqual([
      { provider: "gmail_mailbox", reason: "insufficient_scopes", missingScopes: ["gmail.readonly"] },
      { provider: "google_calendar", reason: "disconnected", missingScopes: [] },
    ]);
  });

  it("resumes at the exact first unfinished step and exposes scope recovery", () => {
    const missingScope = evaluateCustomerOnboardingSignals(signals({
      connected_providers: [],
      connection_issues: [{
        provider: "gmail_mailbox",
        status: "connected",
        credentialsStatus: "configured",
        scopeVerificationStatus: "insufficient",
        missingScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      }],
    }));
    const reconnectPlan = buildCustomerOnboardingResumePlan(missingScope);
    expect(reconnectPlan.currentStep).toMatchObject({
      key: "primary_connection",
      title: "Reconnect gmail mailbox with the required read access",
    });
    expect(reconnectPlan.currentStep?.href).toContain("provider=gmail_mailbox");

    const discovered = evaluateCustomerOnboardingSignals(signals({ operational_records: 1 }));
    const resultPlan = buildCustomerOnboardingResumePlan(discovered);
    expect(resultPlan.currentStep).toMatchObject({ key: "first_value", href: "/app/ferocity?onboarding=1" });
  });
});
