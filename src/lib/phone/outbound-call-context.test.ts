import { describe, expect, it } from "vitest";
import { classifyOutboundCallPurpose, composeOutboundCallVariables } from "./outbound-call-context";

describe("outbound call context", () => {
  it("classifies common service-business call purposes", () => {
    expect(classifyOutboundCallPurpose("follow up on the roof estimate")).toBe("estimate_follow_up");
    expect(classifyOutboundCallPurpose("confirm tomorrow's appointment")).toBe("appointment");
    expect(classifyOutboundCallPurpose("past-due invoice reminder")).toBe("invoice_follow_up");
  });

  it("gives the agent a concrete objective and verified business context", () => {
    const variables = composeOutboundCallVariables({
      contactName: "Taylor",
      contactType: "lead",
      callPurpose: "follow up on Taylor's roofing estimate request",
      businessName: "North Ridge Roofing",
      industry: "Roofing",
      primaryLocation: "Eau Claire, Wisconsin",
      contactFacts: ["Service interest: roof replacement", "Stated urgency: high"],
      businessFacts: ["Service: Residential roof replacement"]
    });
    expect(variables.call_scenario).toBe("estimate_follow_up");
    expect(variables.business_name).toBe("North Ridge Roofing");
    expect(variables.business_context).toContain("Roofing");
    expect(variables.contact_context).toContain("roof replacement");
    expect(variables.context_quality).toBe("prepared");
    expect(variables.desired_outcome).toContain("estimate");
  });

  it("degrades gracefully when only a generic follow-up was supplied", () => {
    const variables = composeOutboundCallVariables({
      contactName: "Taylor",
      contactType: "customer",
      callPurpose: "a requested business follow-up",
      businessName: "North Ridge Roofing"
    });
    expect(variables.context_quality).toBe("limited");
    expect(variables.contact_context).toContain("Clarify naturally");
    expect(variables.call_purpose).not.toContain("unknown");
  });
});
