import { describe, expect, it } from "vitest";
import { businessActionCatalog } from "@/lib/business-actions/catalog";
import { businessActionPrincipalBlockReason, type BusinessActionPrincipal } from "@/lib/business-actions/principal-policy";

const externalPrincipal: BusinessActionPrincipal = {
  principalId: "external:test",
  principalType: "external_agent",
  tenantId: "11111111-1111-4111-8111-111111111111",
  providerKey: "test-provider",
  scopes: ["leads:read"],
  authorization: { verified: true, source: "stored_agent_grant", grantId: "grant-test" }
};

describe("business action gateway boundaries", () => {
  it("rejects unauthenticated principals before database access", () => {
    expect(businessActionPrincipalBlockReason(
      { ...externalPrincipal, authorization: { verified: false, source: "stored_agent_grant", grantId: "grant-test" } },
      businessActionCatalog.getOpenLeads
    )).toContain("not authenticated");
  });

  it("rejects outside-agent tools until each action is certified", () => {
    expect(businessActionPrincipalBlockReason(externalPrincipal, businessActionCatalog.getOpenLeads)).toContain("not certified");
  });
});
