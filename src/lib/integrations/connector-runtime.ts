export type ConnectorExecutionMode = "executable_adapter" | "native_fallback" | "setup_only";

const executableAdapters = new Set([
  "email_provider",
  "marketplacepro",
  "premium_video_rendering",
  "resend_shared",
  "stripe",
  "stripe_connect",
  "supabase_auth",
  "tiktok",
  "twilio",
  "voice_ai",
  "webhook_framework"
]);

const nativeFallbacks = new Set([
  "calendar_provider",
  "external_publishing",
  "quickbooks",
  "twilio_shared"
]);

export function connectorExecutionMode(providerKey: string): ConnectorExecutionMode {
  if (executableAdapters.has(providerKey)) return "executable_adapter";
  if (nativeFallbacks.has(providerKey)) return "native_fallback";
  return "setup_only";
}

export function connectorExecutionLabel(mode: ConnectorExecutionMode) {
  if (mode === "executable_adapter") return "Executable adapter";
  if (mode === "native_fallback") return "Working native fallback";
  return "Adapter not enabled";
}

export function connectorCanBeMarkedReady(providerKey: string) {
  return connectorExecutionMode(providerKey) !== "setup_only";
}
