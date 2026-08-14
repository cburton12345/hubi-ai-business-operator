import { describe, expect, it } from "vitest";
import { composeInboundCallVariables, normalizeVoicePhone } from "./inbound-call-context";

describe("inbound call context", () => {
  it("normalizes North American caller numbers for tenant-scoped matching", () => {
    expect(normalizeVoicePhone("+1 (715) 308-5984")).toBe("7153085984");
  });

  it("gives a known customer useful context without allowing invented actions", () => {
    const variables = composeInboundCallVariables({
      businessName: "North Ridge Roofing",
      callerType: "customer",
      callerName: "Jamie",
      contactFacts: ["Existing customer: Jamie", "Open estimate: Roof repair"],
      services: ["Roof repair"],
      serviceAreas: ["Eau Claire, WI"],
      businessHours: "Monday-Friday, 8:00-17:00"
    });
    expect(variables.caller_status).toBe("customer");
    expect(variables.caller_context).toContain("Open estimate");
    expect(variables.allowed_next_steps).toContain("Never claim an action succeeded");
  });
});
