import {
  resolveSavedPreference,
  type ResolvedSavedPreference,
  type SavedPreferenceScope
} from "@/lib/preferences/saved-preferences";

export const communicationMethods = [
  "automatic_sms",
  "native_sms",
  "google_voice",
  "copy_message",
  "email",
  "ai_voice_call",
  "human_call",
  "skip"
] as const;

export type CommunicationMethod = typeof communicationMethods[number];

export type CommunicationMethodPreference = {
  method: CommunicationMethod;
  executionMode?: CommunicationExecutionMode;
  providerPreference?: CommunicationProviderPreference;
  approvalLevel?: CommunicationApprovalLevel;
  languageMode?: CommunicationLanguageMode;
  language?: string;
  fallbackMode?: CommunicationFallbackMode;
  fallbackMethods?: CommunicationMethod[];
  automationLevel?: CommunicationAutomationLevel;
};

export const communicationExecutionModes = [
  "automatic", "user_confirmation", "open_native_app", "copy_only", "human_action", "disabled"
] as const;
export type CommunicationExecutionMode = typeof communicationExecutionModes[number];

export const communicationProviderPreferences = [
  "organization_default", "user_default", "workflow_provider", "contact_provider", "best_available", "manual_assisted"
] as const;
export type CommunicationProviderPreference = typeof communicationProviderPreferences[number];

export const communicationApprovalLevels = [
  "no_approval", "review_before_sending", "low_confidence_only", "always_require_approval"
] as const;
export type CommunicationApprovalLevel = typeof communicationApprovalLevels[number];

export const communicationLanguageModes = [
  "organization_default", "contact_preference", "auto_detect", "selected"
] as const;
export type CommunicationLanguageMode = typeof communicationLanguageModes[number];

export const communicationFallbackModes = ["ask", "automatic", "none"] as const;
export type CommunicationFallbackMode = typeof communicationFallbackModes[number];

export const communicationAutomationLevels = ["automatic", "ai_assisted", "manual"] as const;
export type CommunicationAutomationLevel = typeof communicationAutomationLevels[number];

export function completeCommunicationPreference(
  value: CommunicationMethodPreference
): Required<CommunicationMethodPreference> {
  const assisted = ["native_sms", "google_voice", "copy_message", "human_call"].includes(value.method);
  return {
    method: value.method,
    executionMode: value.executionMode ?? (
      value.method === "skip" ? "disabled"
        : assisted ? (value.method === "copy_message" ? "copy_only" : value.method === "human_call" ? "human_action" : "open_native_app")
          : "user_confirmation"
    ),
    providerPreference: value.providerPreference ?? (assisted ? "manual_assisted" : "best_available"),
    approvalLevel: value.approvalLevel ?? "review_before_sending",
    languageMode: value.languageMode ?? "contact_preference",
    language: value.language ?? "",
    fallbackMode: value.fallbackMode ?? "ask",
    fallbackMethods: value.fallbackMethods ?? ["native_sms", "email", "human_call", "copy_message"],
    automationLevel: value.automationLevel ?? (assisted ? "manual" : "ai_assisted")
  };
}

export const communicationMethodLabels: Record<CommunicationMethod, string> = {
  automatic_sms: "Automatic SMS",
  native_sms: "Native SMS app",
  google_voice: "Google Voice",
  copy_message: "Copy message",
  email: "Email",
  ai_voice_call: "AI voice call",
  human_call: "Human call",
  skip: "Skip"
};

export function communicationPreferenceScopes(input: {
  contactKey?: string | null;
  workflowKey?: string | null;
  userId?: string | null;
}): SavedPreferenceScope[] {
  const scopes: SavedPreferenceScope[] = [];
  if (input.contactKey) scopes.push({ type: "contact", key: input.contactKey });
  if (input.workflowKey) scopes.push({ type: "workflow", key: input.workflowKey });
  if (input.userId) scopes.push({ type: "user", key: input.userId });
  scopes.push({ type: "organization", key: "default" });
  return scopes;
}

export async function resolveCommunicationMethod(input: {
  tenantId: string;
  contactKey?: string | null;
  workflowKey?: string | null;
  userId?: string | null;
  oneTimeOverride?: CommunicationMethod | null;
}): Promise<ResolvedSavedPreference<CommunicationMethodPreference>> {
  return resolveSavedPreference({
    tenantId: input.tenantId,
    domain: "communication",
    key: "delivery_method",
    scopes: communicationPreferenceScopes(input),
    fallback: { method: "native_sms" },
    oneTimeOverride: input.oneTimeOverride
      ? { method: input.oneTimeOverride }
      : null
  });
}

export function communicationRoute(method: CommunicationMethod) {
  switch (method) {
    case "automatic_sms":
      return { actionType: "sms_send", providerKey: null, channel: "sms" as const };
    case "native_sms":
      return { actionType: "sms_send", providerKey: "manual_sms", channel: "manual_sms" as const };
    case "google_voice":
      return { actionType: "sms_send", providerKey: "google_voice_manual", channel: "manual_sms" as const };
    case "copy_message":
      return { actionType: "manual_message", providerKey: "copy_message", channel: "internal" as const };
    case "email":
      return { actionType: "email_send", providerKey: null, channel: "email" as const };
    case "ai_voice_call":
      return { actionType: "voice_call", providerKey: null, channel: "phone" as const };
    case "human_call":
      return { actionType: "phone_call", providerKey: "manual_phone", channel: "phone" as const };
    case "skip":
      return { actionType: "communication_skipped", providerKey: "none", channel: "internal" as const };
  }
}

export function automaticCommunicationRequiresConsent(method: CommunicationMethod) {
  return method === "automatic_sms" || method === "email" || method === "ai_voice_call";
}
