export const communicationMethods = [
  "automatic_sms", "native_sms", "google_voice", "copy_message",
  "email", "ai_voice_call", "human_call", "skip"
] as const;
export type CommunicationMethod = typeof communicationMethods[number];

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

export function completeCommunicationPreference(value: CommunicationMethodPreference): Required<CommunicationMethodPreference> {
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
