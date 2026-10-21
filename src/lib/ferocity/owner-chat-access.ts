import { can, canReviewRisk, type AccessActor } from "@/lib/auth/permissions";
import type { RiskLevel } from "@/types/core";

export type OwnerChatCapabilities = {
  canOpenOwnerChat: boolean;
  canConfigureOnboarding: boolean;
  canControlGoals: boolean;
  canReviewApproval: (riskLevel: string) => boolean;
};

function isRiskLevel(value: string): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

export function getOwnerChatCapabilities(actor: AccessActor): OwnerChatCapabilities {
  const canManageTenant = can(actor, "tenant:manage");

  return {
    canOpenOwnerChat: can(actor, "ai:queue"),
    canConfigureOnboarding: canManageTenant,
    canControlGoals: canManageTenant,
    canReviewApproval: (riskLevel: string) =>
      isRiskLevel(riskLevel) && canReviewRisk(actor, riskLevel),
  };
}
