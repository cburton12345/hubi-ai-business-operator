import { describe, expect, it } from "vitest";
import { normalizePhoneForSmsConsent } from "@/lib/sms/public-consent";

describe("public SMS opt-in phone normalization", () => {
  it("normalizes a ten-digit US number", () => {
    expect(normalizePhoneForSmsConsent("(715) 555-0123")).toBe("+17155550123");
  });

  it("preserves an international E.164-compatible number", () => {
    expect(normalizePhoneForSmsConsent("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects an incomplete number", () => {
    expect(normalizePhoneForSmsConsent("555-12")).toBeNull();
  });
});
