import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeVonageDeliveryReceipt } from "@/lib/messaging/message-health";

describe("Vonage message health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("distinguishes accepted transport from delivery", () => {
    expect(normalizeVonageDeliveryReceipt({ status: "submitted" }).normalizedStatus).toBe("sent");
    expect(normalizeVonageDeliveryReceipt({ status: "delivered" }).normalizedStatus).toBe("delivered");
  });

  it("preserves provider rejection evidence", () => {
    expect(normalizeVonageDeliveryReceipt({
      status: "rejected",
      errorCode: "1300",
      errorMessage: "Carrier rejected the message"
    })).toMatchObject({
      normalizedStatus: "rejected",
      errorCode: "1300",
      safeReason: "Carrier rejected the message",
      isFinal: true
    });
  });
});
