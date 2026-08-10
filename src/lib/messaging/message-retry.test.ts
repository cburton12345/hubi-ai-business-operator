import { describe, expect, it } from "vitest";
import { assessMessageRetry } from "./message-retry";

const failedSms = {
  body: "Your estimate is ready.",
  channel: "sms" as const,
  deliveryStatus: "undelivered",
  retryAttempt: 0
};

describe("message retry safety", () => {
  it("allows an explicit retry through a different compatible provider", () => {
    expect(assessMessageRetry({
      message: failedSms,
      requestedProviderKey: "alternate_sms",
      providerExists: true,
      providerSupportsCapability: true
    })).toMatchObject({ allowed: true, providerKey: "alternate_sms", capability: "sms" });
  });

  it("blocks unsupported providers and messages that have reached the retry cap", () => {
    expect(assessMessageRetry({
      message: failedSms,
      requestedProviderKey: "email_only",
      providerExists: true,
      providerSupportsCapability: false
    })).toMatchObject({ allowed: false, reason: "unsupported_channel" });
    expect(assessMessageRetry({
      message: { ...failedSms, retryAttempt: 3 },
      requestedProviderKey: "alternate_sms",
      providerExists: true,
      providerSupportsCapability: true
    })).toMatchObject({ allowed: false, reason: "retry_limit_reached" });
  });

  it("never retries a redacted security message", () => {
    expect(assessMessageRetry({
      message: { ...failedSms, body: "[Sensitive security message redacted] one-time code" },
      requestedProviderKey: "alternate_sms",
      providerExists: true,
      providerSupportsCapability: true
    })).toMatchObject({ allowed: false, reason: "sensitive_message" });
  });
});
