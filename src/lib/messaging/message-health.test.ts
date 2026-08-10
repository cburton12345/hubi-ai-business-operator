import { describe, expect, it } from "vitest";
import {
  canonicalMessageStatus,
  normalizeResendDeliveryReceipt,
  normalizeTwilioDeliveryReceipt,
  shouldApplyDeliveryUpdate
} from "./message-health";

describe("message health", () => {
  it("normalizes Twilio lifecycle states without leaking them into business logic", () => {
    expect(normalizeTwilioDeliveryReceipt({ status: "accepted" }).normalizedStatus).toBe("accepted");
    expect(normalizeTwilioDeliveryReceipt({ status: "sending" }).normalizedStatus).toBe("sending");
    expect(normalizeTwilioDeliveryReceipt({ status: "delivered" }).normalizedStatus).toBe("delivered");
    expect(normalizeTwilioDeliveryReceipt({ status: "undelivered" }).normalizedStatus).toBe("undelivered");
  });

  it("uses provider evidence before calling a delivery suspected filtered", () => {
    const filtered = normalizeTwilioDeliveryReceipt({ status: "undelivered", errorCode: "30007" });
    expect(filtered.normalizedStatus).toBe("suspected_filtered");
    expect(filtered.suspectedFiltered).toBe(true);
    expect(filtered.safeReason).toMatch(/provider or carrier/i);

    const genericFailure = normalizeTwilioDeliveryReceipt({ status: "undelivered", errorCode: "30008" });
    expect(genericFailure.normalizedStatus).toBe("undelivered");
    expect(genericFailure.suspectedFiltered).toBe(false);
  });

  it("normalizes Resend delivery and bounce events", () => {
    expect(normalizeResendDeliveryReceipt({ status: "email.sent" }).normalizedStatus).toBe("sent");
    expect(normalizeResendDeliveryReceipt({ status: "email.delivered" }).normalizedStatus).toBe("delivered");
    expect(normalizeResendDeliveryReceipt({ status: "email.bounced" }).normalizedStatus).toBe("undelivered");
    expect(normalizeResendDeliveryReceipt({ status: "email.suppressed" }).normalizedStatus).toBe("rejected");
  });

  it("never lets a late non-final receipt reverse a delivered message", () => {
    expect(shouldApplyDeliveryUpdate({
      currentStatus: "delivered",
      currentFinal: true,
      currentUpdatedAt: new Date("2026-08-04T12:00:00Z"),
      incomingStatus: "sent",
      incomingFinal: false,
      incomingReceiptAt: new Date("2026-08-04T12:01:00Z")
    })).toBe(false);
  });

  it("allows delivered evidence to resolve an earlier terminal failure", () => {
    expect(shouldApplyDeliveryUpdate({
      currentStatus: "undelivered",
      currentFinal: true,
      currentUpdatedAt: new Date("2026-08-04T12:00:00Z"),
      incomingStatus: "delivered",
      incomingFinal: true,
      incomingReceiptAt: new Date("2026-08-04T12:01:00Z")
    })).toBe(true);
  });

  it("ignores an out-of-order receipt and maps health to the legacy message status", () => {
    expect(shouldApplyDeliveryUpdate({
      currentStatus: "sent",
      currentFinal: false,
      currentUpdatedAt: new Date("2026-08-04T12:00:00Z"),
      incomingStatus: "queued",
      incomingFinal: false,
      incomingReceiptAt: new Date("2026-08-04T11:59:00Z")
    })).toBe(false);
    expect(canonicalMessageStatus("suspected_filtered")).toBe("failed");
    expect(canonicalMessageStatus("sending")).toBe("sent");
  });
});
