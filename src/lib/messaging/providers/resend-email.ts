import { getEmailProvider } from "@/lib/email/provider-registry";
import { normalizeResendDeliveryReceipt } from "@/lib/messaging/message-health";
import type { MessagingCapability, MessagingProvider, MessagingSendInput, MessagingSendResult } from "../types";

const capabilities: MessagingCapability[] = ["email", "inbound_webhook", "delivery_webhook"];

export const resendEmailProvider: MessagingProvider = {
  providerKey: "resend_email",
  displayName: "Resend Email",
  getCapabilities() {
    return capabilities;
  },
  supportsCapability(capability) {
    return capabilities.includes(capability);
  },
  getStatus() {
    return getEmailProvider("resend_email")?.getStatus()
      ?? { ready: false, missing: ["resend_email"], status: "not_configured" };
  },
  normalizeDeliveryReceipt(input) {
    return normalizeResendDeliveryReceipt(input);
  },
  async sendMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    const provider = getEmailProvider("resend_email");
    if (!provider) {
      return { ok: false, providerKey: "resend_email", status: 0, error: "Email provider is unavailable.", retryable: false };
    }
    const result = await provider.sendEmail({
      tenantId: input.tenantId,
      to: input.to,
      subject: input.subject || "Message from Ferocity",
      body: input.body,
      idempotencyKey: input.queueId || input.idempotencyKey || "messaging-engine"
    });
    if (!result.ok) {
      return {
        ok: false,
        providerKey: result.providerKey,
        status: result.status,
        error: result.error,
        retryable: result.retryable
      };
    }
    return {
      ok: true,
      providerKey: result.providerKey,
      providerMessageId: result.providerMessageId,
      status: "sent"
    };
  },
  async sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    return this.sendMessage(input);
  }
};
