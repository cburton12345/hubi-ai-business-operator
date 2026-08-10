import { getProviderCapabilityTruth, providerCanExecute } from "@/lib/integrations/capability-truth";

export type ConnectorExecutionMode = "executable_adapter" | "native_fallback" | "connection_only" | "setup_only";

export function connectorExecutionMode(providerKey: string): ConnectorExecutionMode {
  const provider = getProviderCapabilityTruth(providerKey);
  if (providerCanExecute(providerKey)) return "executable_adapter";
  if (provider?.state === "fallback_only") return "native_fallback";
  if (provider?.connectionAvailable) return "connection_only";
  return "setup_only";
}

export function connectorExecutionLabel(mode: ConnectorExecutionMode) {
  if (mode === "executable_adapter") return "Executable adapter";
  if (mode === "native_fallback") return "Working native fallback";
  if (mode === "connection_only") return "Account connection only";
  return "Adapter not enabled";
}

export function connectorCanBeMarkedReady(providerKey: string) {
  const mode = connectorExecutionMode(providerKey);
  return mode === "executable_adapter" || mode === "native_fallback";
}
