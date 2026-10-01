import { describe, expect, it } from "vitest";
import { ferocityConnectInboundMessageSchema } from "./inbound-message";

const baseMessage = {
  eventId: "event-123456",
  recipient: "+17153085984",
  body: "567227",
  receivedAt: "2026-09-04T12:00:00.000Z",
  subscriptionId: 1
};

describe("ferocityConnectInboundMessageSchema", () => {
  it.each(["12345", "123456", "INFO", "+17153085984"])("accepts valid sender %s", (sender) => {
    expect(ferocityConnectInboundMessageSchema.safeParse({ ...baseMessage, sender }).success).toBe(true);
  });

  it("rejects a blank sender", () => {
    expect(ferocityConnectInboundMessageSchema.safeParse({ ...baseMessage, sender: "   " }).success).toBe(false);
  });
});
