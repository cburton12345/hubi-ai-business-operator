import { describe, expect, it } from "vitest";
import { customerOAuthSetupItems } from "./get-integrations";

describe("customer OAuth boundary", () => {
  it("gives customers a normal connect flow without developer infrastructure", () => {
    const steps = customerOAuthSetupItems("google_ads", "Google Ads").join(" ").toLowerCase();
    expect(steps).toContain("click connect");
    expect(steps).toContain("grant");
    expect(steps).toContain("select");
    expect(steps).not.toContain("client secret");
    expect(steps).not.toContain("developer token");
    expect(steps).not.toContain("create app");
    expect(steps).not.toContain("api key");
  });
});
