import { enqueueConnectSms } from "@/lib/ferocity-connect/queue";
import type { MessagingCapability, MessagingProvider } from "../types";

const capabilities: MessagingCapability[] = ["sms", "inbound_webhook", "delivery_webhook"];

export const ferocityConnectProvider: MessagingProvider = {
  providerKey: "ferocity_connect",
  displayName: "Ferocity Connect",
  getCapabilities: () => capabilities,
  supportsCapability: (capability) => capabilities.includes(capability),
  getStatus: () => ({ ready: true, missing: [], status: "ready" }),
  sendMessage: enqueueConnectSms,
  sendMediaMessage: enqueueConnectSms
};
