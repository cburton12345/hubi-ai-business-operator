import type { DistributionContext, DistributionRequest, DistributionResult, GrowthDistributionConnector } from "./distribution-connector";
import { assistedHandoff, resolveDistributionRoute } from "./distribution-connector";

export type FacebookSurface = "page" | "group" | "messenger" | "unknown";
export type FacebookUiSnapshot = {
  url: string;
  connectorVersion: string;
  surfaceHint?: string;
  composerDetected?: boolean;
  threadDetected?: boolean;
  warningText?: string;
  verificationPromptDetected?: boolean;
};

export function interpretFacebookSurface(snapshot: FacebookUiSnapshot) {
  const pathname = new URL(snapshot.url).pathname.toLowerCase();
  const surface: FacebookSurface = pathname.includes("/groups/") ? "group"
    : pathname.includes("/messages/") || snapshot.threadDetected ? "messenger"
      : pathname.includes("/pages/") || snapshot.composerDetected ? "page" : "unknown";
  if (snapshot.verificationPromptDetected) return { surface, safe: false, state: "verification_required" as const, reason: "Facebook requested legitimate account verification." };
  if (snapshot.warningText) return { surface, safe: false, state: "warning" as const, reason: snapshot.warningText };
  if (surface === "unknown") return { surface, safe: false, state: "connector_incompatible" as const, reason: "The current Facebook UI could not be identified safely." };
  return { surface, safe: true, state: "ready" as const, reason: "Known surface detected; the owner still controls assisted actions." };
}

/**
 * Thin assisted plumbing only. Facebook selectors/DOM interpretation belong in
 * the connector client and arrive as a normalized snapshot. Growth business
 * logic never imports DOM selectors and this adapter never reports success for
 * an action that still requires owner control.
 */
export class FacebookAssistedConnector implements GrowthDistributionConnector {
  channelKey = "facebook";
  providerKey = "facebook";

  async execute(_context: DistributionContext, request: DistributionRequest): Promise<DistributionResult> {
    const route = resolveDistributionRoute(this.channelKey, request.capability);
    if (route.support === "unavailable") {
      return { ok: false, status: "not_supported", errorCode: "facebook_capability_unavailable", message: route.reason };
    }
    return assistedHandoff(this.channelKey, request.capability, "Review the prepared action in the legitimate signed-in Facebook account, then confirm the outcome.");
  }
}
