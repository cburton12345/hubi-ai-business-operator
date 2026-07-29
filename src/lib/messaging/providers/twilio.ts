import { getTwilioSmsReadiness, sendSmsWithTwilio } from "@/lib/sms/twilio";
import { resolveTwilioSmsConfiguration } from "@/lib/messaging/twilio-tenant-config";
import type { MessagingCapability, MessagingProvider, MessagingSendInput, MessagingSendResult } from "../types";

const capabilities: MessagingCapability[] = ["sms", "mms", "inbound_webhook", "delivery_webhook", "phone_number_provisioning", "business_registration"];

export const twilioSmsProvider: MessagingProvider = {
  providerKey: "twilio_sms",
  displayName: "Twilio SMS/MMS",
  getCapabilities() {
    return capabilities;
  },
  supportsCapability(capability) {
    return capabilities.includes(capability);
  },
  getStatus() {
    const readiness = getTwilioSmsReadiness();
    return {
      ready: readiness.ready,
      missing: readiness.missing,
      status: readiness.ready ? "ready" : "not_configured"
    };
  },
  async sendMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    const configuration = await resolveTwilioSmsConfiguration(input.tenantId);
    if (!configuration) {
      return {
        ok: false,
        providerKey: "twilio_sms",
        status: 0,
        error: "No active customer-owned or Ferocity-managed Twilio route is enabled for this workspace.",
        retryable: false
      };
    }
    const result = await sendSmsWithTwilio({ to: input.to, body: input.body, configuration });
    if (!result.ok) {
      return {
        ok: false,
        providerKey: "twilio_sms",
        status: result.status,
        error: result.error,
        retryable: result.status === 0 || result.status >= 500
      };
    }
    return {
      ok: true,
      providerKey: "twilio_sms",
      providerMessageId: result.providerMessageId,
      status: "sent"
    };
  },
  async sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    return this.sendMessage(input);
  }
};
