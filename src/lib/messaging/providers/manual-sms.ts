import { manualSmsHref } from "@/lib/communication/manual-sms";
import type { MessagingProvider, MessagingSendInput, MessagingSendResult, MessagingCapability } from "../types";

const capabilities: MessagingCapability[] = ["sms", "manual_send"];

export const manualSmsProvider: MessagingProvider = {
  providerKey: "manual_sms",
  displayName: "Manual phone SMS",
  getCapabilities() {
    return capabilities;
  },
  supportsCapability(capability) {
    return capabilities.includes(capability);
  },
  getStatus() {
    return { ready: true, missing: [], status: "ready" };
  },
  async sendMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    return {
      ok: true,
      providerKey: "manual_sms",
      providerMessageId: null,
      status: "manual_ready",
      manualHref: manualSmsHref(input.to, input.body),
      metadata: { assistedSend: true }
    };
  },
  async sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
    return this.sendMessage(input);
  }
};
