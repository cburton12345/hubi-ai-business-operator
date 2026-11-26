import { describe, expect, it } from "vitest";
import { normalizeLoginIdentifier } from "./login-identifier";

describe("login identifier normalization", () => {
  it("normalizes email without changing its account meaning", () => {
    expect(normalizeLoginIdentifier("  Worker@Example.COM ")).toEqual({
      kind: "email",
      canonical: "worker@example.com",
      phoneCandidates: []
    });
  });

  it("accepts common US phone formatting and matches stored country-code variants", () => {
    expect(normalizeLoginIdentifier("(612) 555-0199")).toEqual({
      kind: "phone",
      canonical: "16125550199",
      phoneCandidates: ["6125550199", "16125550199"]
    });
    expect(normalizeLoginIdentifier("+1 612-555-0199")?.phoneCandidates).toEqual([
      "16125550199",
      "6125550199"
    ]);
  });

  it("keeps international numbers explicit and rejects ambiguous identifiers", () => {
    expect(normalizeLoginIdentifier("+44 20 7946 0958")).toEqual({
      kind: "phone",
      canonical: "442079460958",
      phoneCandidates: ["442079460958"]
    });
    for (const value of ["", "12345", "612-CALL-NOW", "not-an-email", "a@b", "+1234567890123456"]) {
      expect(normalizeLoginIdentifier(value)).toBeNull();
    }
  });
});
