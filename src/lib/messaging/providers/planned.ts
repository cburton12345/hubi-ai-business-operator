import type { MessagingCapability, MessagingProvider, MessagingSendInput, MessagingSendResult } from "../types";

export function plannedMessagingProvider(providerKey: string, displayName: string, capabilities: MessagingCapability[]): MessagingProvider {
  return {
    providerKey,
    displayName,
    getCapabilities() {
      return capabilities;
    },
    supportsCapability(capability) {
      return capabilities.includes(capability);
    },
    getStatus() {
      return { ready: false, missing: [`${providerKey.toUpperCase()} provider adapter`], status: "planned" };
    },
    async sendMessage(_input: MessagingSendInput): Promise<MessagingSendResult> {
      return {
        ok: false,
        providerKey,
        status: 0,
        error: `${displayName} is scaffolded but not implemented yet.`,
        retryable: false
      };
    },
    async sendMediaMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
      return this.sendMessage(input);
    }
  };
}
