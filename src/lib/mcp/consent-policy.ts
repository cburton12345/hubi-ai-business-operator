export const EXTERNAL_AI_CONSENT_VERSION = "external-ai-connection-v1-2026-10-14";

export const EXTERNAL_AI_CONSENT_SUMMARY =
  "I authorize the selected external AI provider to receive only the Ferocity business data returned by the scopes I select. The provider operates under its own account, terms, privacy policy, and data controls. Ferocity remains the system of record and does not disclose its source code, private prompts, credentials, database access, or proprietary orchestration logic.";

export const EXTERNAL_AI_PROTECTED_BOUNDARIES = [
  "Ferocity works without an outside AI; this connection is optional.",
  "Only the selected workspace and scopes are available to the connected assistant.",
  "Read access does not authorize sending, publishing, spending, moving money, deleting records, or changing protected business records.",
  "Ferocity filters secrets and internal implementation details before returning tool results.",
  "The external AI provider may process the business data deliberately returned to it under that provider's own agreement with the customer.",
] as const;
