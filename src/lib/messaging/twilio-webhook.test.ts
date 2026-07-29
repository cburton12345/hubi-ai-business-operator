import { describe, expect, it } from "vitest";
import {
  calculateTwilioSignature,
  classifyTwilioMessagingWebhook,
  verifyTwilioWebhookSignature
} from "./twilio-webhook";

describe("Twilio webhook signatures", () => {
  it("accepts only the signature calculated from the exact URL and all parameters", () => {
    const url = "https://ferocity.live/api/messaging/webhooks/twilio";
    const params = new URLSearchParams({
      MessageSid: "SM123",
      From: "+15550001111",
      To: "+15550002222",
      Body: "Hello"
    });
    const signature = calculateTwilioSignature(url, params, "tenant-auth-token");
    expect(verifyTwilioWebhookSignature(url, params, "tenant-auth-token", signature)).toBe(true);
    expect(verifyTwilioWebhookSignature(url, params, "wrong-token", signature)).toBe(false);
  });

  it("does not mistake an inbound SmsStatus=received event for a delivery callback", () => {
    expect(classifyTwilioMessagingWebhook(new URLSearchParams({
      MessageSid: "SM123",
      SmsStatus: "received",
      From: "+15550001111",
      To: "+15550002222",
      Body: "Please call me"
    }))).toBe("inbound_message");
    expect(classifyTwilioMessagingWebhook(new URLSearchParams({
      MessageSid: "SM123",
      MessageStatus: "delivered",
      From: "+15550002222",
      To: "+15550001111"
    }))).toBe("delivery_status");
  });
});
