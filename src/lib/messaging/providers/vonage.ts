import { env } from "@/lib/env";
import { normalizeVonageDeliveryReceipt } from "@/lib/messaging/message-health";
import type { MessagingCapability, MessagingProvider, MessagingSendInput, MessagingSendResult } from "../types";

const capabilities: MessagingCapability[] = ["sms", "inbound_webhook", "delivery_webhook", "business_registration"];

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function getVonageSmsReadiness() {
  const fromNumber = env.VONAGE_FROM_NUMBER || env.VONAGE_SMS_FROM;
  const missing = [
    !env.VONAGE_API_KEY ? "VONAGE_API_KEY" : null,
    !env.VONAGE_API_SECRET ? "VONAGE_API_SECRET" : null,
    !fromNumber ? "VONAGE_FROM_NUMBER or VONAGE_SMS_FROM" : null,
    !env.VONAGE_SIGNATURE_SECRET ? "VONAGE_SIGNATURE_SECRET" : null,
    env.ENABLE_VONAGE_SMS_SENDS !== "true" ? "ENABLE_VONAGE_SMS_SENDS=true" : null
  ].filter((value): value is string => Boolean(value));
  return { ready: missing.length === 0, missing };
}

export const vonageSmsProvider: MessagingProvider = {
  providerKey: "vonage_sms",
  displayName: "Vonage SMS",
  getCapabilities: () => capabilities,
  supportsCapability: (capability) => capabilities.includes(capability),
  getStatus() {
    const readiness = getVonageSmsReadiness();
    return {
      ready: readiness.ready,
      missing: readiness.missing,
      status: readiness.ready ? "ready" : "not_configured"
    };
  },
  normalizeDeliveryReceipt(input) {
    return normalizeVonageDeliveryReceipt(input);
  },
  async sendMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    const readiness = getVonageSmsReadiness();
    if (!readiness.ready) {
      return {
        ok: false,
        providerKey: "vonage_sms",
        status: 0,
        error: "Vonage SMS is approved as an account but is not fully configured and certified for live sending.",
        retryable: false,
        metadata: { missing: readiness.missing }
      };
    }

    const endpoint = (env.VONAGE_MESSAGES_API_URL ?? "https://api.nexmo.com").replace(/\/+$/, "");
    try {
      const response = await fetch(`${endpoint}/v1/messages`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${env.VONAGE_API_KEY}:${env.VONAGE_API_SECRET}`).toString("base64")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: digits(input.to),
          from: digits(input.from || env.VONAGE_FROM_NUMBER || env.VONAGE_SMS_FROM || ""),
          channel: "sms",
          message_type: "text",
          text: input.body,
          client_ref: (input.idempotencyKey ?? input.queueId ?? crypto.randomUUID()).slice(0, 100),
          ...(env.FEROCITY_APP_URL
            ? { webhook_url: `${env.FEROCITY_APP_URL.replace(/\/+$/, "")}/api/messaging/webhooks/vonage` }
            : {})
        })
      });
      const payload = await response.json().catch(() => ({})) as {
        message_uuid?: string;
        title?: string;
        detail?: string;
        type?: string;
      };
      if (!response.ok || !payload.message_uuid) {
        return {
          ok: false,
          providerKey: "vonage_sms",
          status: response.status,
          error: payload.detail || payload.title || "Vonage rejected the message request.",
          retryable: response.status === 429 || response.status >= 500,
          metadata: { providerErrorType: payload.type ?? null }
        };
      }
      return {
        ok: true,
        providerKey: "vonage_sms",
        providerMessageId: payload.message_uuid,
        status: "sent"
      };
    } catch {
      return {
        ok: false,
        providerKey: "vonage_sms",
        status: 0,
        error: "Vonage could not be reached. The message was not confirmed as sent.",
        retryable: true
      };
    }
  },
  async sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    return {
      ok: false,
      providerKey: "vonage_sms",
      status: 0,
      error: input.attachments?.length
        ? "Vonage MMS has not been certified for this Ferocity route yet."
        : "Vonage media messaging is unavailable.",
      retryable: false
    };
  }
};
