import type { BusinessActionDefinition } from "@/lib/business-actions/catalog";

export type BusinessActionPrincipal = {
  principalId: string;
  principalType: "ferocity_native" | "external_agent" | "user" | "system";
  tenantId: string;
  providerKey?: string | null;
  userId?: string | null;
  scopes: string[];
  authorization: {
    verified: boolean;
    source: "native_runtime" | "authenticated_user_session" | "stored_agent_grant";
    grantId?: string | null;
  };
  metadata?: Record<string, unknown>;
};

export function businessActionPrincipalBlockReason(principal: BusinessActionPrincipal, definition: BusinessActionDefinition) {
  if (!principal.authorization.verified) return "The business-action principal is not authenticated.";
  if (principal.principalType !== "external_agent") return null;
  if (principal.authorization.source !== "stored_agent_grant" || !principal.authorization.grantId) {
    return "External agents require a stored, revocable Ferocity grant.";
  }
  if (!definition.externalReady) return `${definition.key} is not certified for outside-agent access.`;
  return null;
}
