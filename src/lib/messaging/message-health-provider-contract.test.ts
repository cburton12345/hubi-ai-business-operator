import { describe, expect, it } from "vitest";
import { resendEmailProvider } from "./providers/resend-email";
import { twilioSmsProvider } from "./providers/twilio";

const deliveryCertifiedAdapters = [twilioSmsProvider, resendEmailProvider];

describe("message health provider contract", () => {
  it.each(deliveryCertifiedAdapters)(
    "$displayName exposes normalization whenever it advertises delivery webhooks",
    (provider) => {
      expect(provider.supportsCapability("delivery_webhook")).toBe(true);
      expect(provider.normalizeDeliveryReceipt).toBeTypeOf("function");
    }
  );

  it("returns the provider-independent receipt shape from every certified adapter", () => {
    for (const provider of deliveryCertifiedAdapters) {
      const normalized = provider.normalizeDeliveryReceipt?.({ status: "delivered" });
      expect(normalized).toEqual(expect.objectContaining({
        normalizedStatus: expect.any(String),
        rawStatus: expect.any(String),
        errorCode: null,
        safeReason: null,
        suspectedFiltered: expect.any(Boolean),
        isFinal: expect.any(Boolean)
      }));
    }
  });
});
