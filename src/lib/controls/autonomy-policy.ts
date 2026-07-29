import type { ServiceMode } from "./service-gates";

export type LiveActionPolicyState = {
  status: "disabled" | "review_only" | "approval_required" | "live";
  requiresHumanApproval: boolean;
  reason: string;
};

const alwaysProtectedActionKeys = new Set([
  "billing_sync"
]);

export function liveActionPolicyForMode(actionKey: string, mode: ServiceMode): LiveActionPolicyState {
  if (mode === "off") {
    return {
      status: "disabled",
      requiresHumanApproval: true,
      reason: "The owner turned this action off."
    };
  }
  if (mode === "draft_only") {
    return {
      status: "review_only",
      requiresHumanApproval: true,
      reason: "Ferocity may prepare work but may not execute it."
    };
  }
  if (mode === "review_required") {
    return {
      status: "approval_required",
      requiresHumanApproval: true,
      reason: "The owner chose approval before execution."
    };
  }
  if (alwaysProtectedActionKeys.has(actionKey)) {
    return {
      status: "approval_required",
      requiresHumanApproval: true,
      reason: "This action changes billing or financial authority and remains protected."
    };
  }
  return {
    status: "live",
    requiresHumanApproval: false,
    reason: "The owner explicitly allowed automatic execution. Provider, consent, suppression, readiness, and cost controls still apply."
  };
}

export function fieldLogNeedsReview(
  mode: ServiceMode,
  risks: Array<{ category: string; severity: string }>
) {
  if (mode !== "enabled") return true;
  return risks.some((risk) =>
    ["high", "critical"].includes(risk.severity)
    || ["safety", "change", "money"].includes(risk.category)
  );
}
