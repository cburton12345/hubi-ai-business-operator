import { describe, expect, it } from "vitest";
import {
  hasAuthenticatedOwnerVerificationConsent,
  messageBodyForStorage,
  messageDestinationForStorage
} from "./messaging-engine";
import type { MessagingSendInput } from "./types";

const base: MessagingSendInput = {
  tenantId: "tenant-1",
  channel: "sms",
  to: "+17155550123",
  body: "123456 is your Ferocity verification code."
};

describe("authenticated owner verification consent", () => {
  it("accepts only the exact signed-in security authorization combination", () => {
    expect(hasAuthenticatedOwnerVerificationConsent({
      ...base,
      authorization: {
        source: "authenticated_owner_verification",
        humanApproved: true,
        consentBasis: "authenticated_owner_verification"
      }
    })).toBe(true);
    expect(hasAuthenticatedOwnerVerificationConsent({
      ...base,
      authorization: {
        source: "automation",
        humanApproved: true,
        consentBasis: "authenticated_owner_verification"
      }
    })).toBe(false);
    expect(hasAuthenticatedOwnerVerificationConsent({
      ...base,
      authorization: {
        source: "authenticated_owner_verification",
        humanApproved: false,
        consentBasis: "authenticated_owner_verification"
      }
    })).toBe(false);
  });

  it("redacts security codes from persisted message history", () => {
    expect(messageBodyForStorage({
      ...base,
      body: "123456 is your Ferocity verification code.",
      metadata: { securityTransactional: true }
    })).toBe("[Sensitive security message redacted]");
    expect(messageDestinationForStorage({
      ...base,
      metadata: { securityTransactional: true }
    })).toBe("[redacted destination ending 0123]");
    expect(messageBodyForStorage(base)).toBe(base.body);
    expect(messageDestinationForStorage(base)).toBe(base.to);
  });
});
