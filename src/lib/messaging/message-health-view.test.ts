import { describe, expect, it } from "vitest";
import {
  messageHealthLabel,
  messageHealthTone,
  messageNeedsAttention,
  safeDeliveryExplanation
} from "./message-health-view";

describe("conversation timeline message health", () => {
  it.each(["failed", "rejected", "undelivered", "suspected_filtered"])(
    "marks %s as needing attention",
    (status) => expect(messageNeedsAttention(status)).toBe(true)
  );

  it("keeps successful, pending, and inbound messages out of the failure state", () => {
    expect(messageNeedsAttention("delivered")).toBe(false);
    expect(messageHealthTone("delivered")).toBe("");
    expect(messageHealthTone("sent")).toBe("medium");
    expect(messageHealthLabel({ direction: "inbound", deliveryStatus: "unknown" })).toBe("received");
  });

  it("presents provider-safe details without exposing payloads or credentials", () => {
    expect(safeDeliveryExplanation({
      direction: "outbound",
      safeReason: "The carrier could not deliver this message.",
      errorCode: "30008"
    })).toBe("The carrier could not deliver this message. Provider code: 30008.");
    expect(safeDeliveryExplanation({ direction: "inbound", safeReason: "ignored" })).toBeNull();
  });
});
