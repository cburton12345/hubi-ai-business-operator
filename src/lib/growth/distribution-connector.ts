import { getGrowthChannel, type GrowthChannelCapability } from "./distribution-engine";

export type DistributionContext = {
  tenantId: string;
  brandId: string;
  identityId: string;
  objectiveId?: string;
  communityId?: string;
  idempotencyKey: string;
};

export type DistributionRequest = {
  capability: GrowthChannelCapability;
  payload: Record<string, unknown>;
};

export type DistributionResult = {
  ok: boolean;
  status: "succeeded" | "needs_human" | "not_supported" | "failed";
  providerReference?: string;
  errorCode?: string;
  message?: string;
  data?: Record<string, unknown>;
};

/**
 * Provider adapters implement this boundary. Business logic must not import a
 * provider SDK or browser selector directly.
 */
export interface GrowthDistributionConnector {
  channelKey: string;
  providerKey: string;
  execute(context: DistributionContext, request: DistributionRequest): Promise<DistributionResult>;
  receiveWebhook?(headers: Headers, body: string): Promise<DistributionResult>;
}

export function resolveDistributionRoute(channelKey: string, capability: GrowthChannelCapability) {
  const channel = getGrowthChannel(channelKey);
  const support = channel?.capabilities[capability] ?? "unavailable";
  return {
    channelKey,
    providerKey: channel?.providerKey ?? "unknown",
    support,
    executionMode: channel?.defaultMode ?? "manual",
    executableByAdapter: support === "official",
    requiresHumanControl: support === "assisted" || support === "manual",
    reason: channel?.note ?? "No connector capability has been registered."
  };
}

/**
 * Used by thin browser/manual connectors. It creates an honest handoff result;
 * it never pretends a draft or opened page was successfully published.
 */
export function assistedHandoff(channelKey: string, capability: GrowthChannelCapability, instructions: string): DistributionResult {
  const route = resolveDistributionRoute(channelKey, capability);
  if (route.support === "unavailable") {
    return { ok: false, status: "not_supported", errorCode: "capability_unavailable", message: route.reason };
  }
  return {
    ok: false,
    status: "needs_human",
    errorCode: "human_control_required",
    message: instructions,
    data: { channelKey, capability, executionMode: route.executionMode }
  };
}
