import type { ExternalCallLogAdapter, ExternalCallLogProvider } from "@/lib/integrations/call-log/contracts";
import { highLevelCallLogAdapter } from "@/lib/integrations/call-log/highlevel";
import { hubSpotCallLogAdapter } from "@/lib/integrations/call-log/hubspot";

const adapters = new Map<ExternalCallLogProvider, ExternalCallLogAdapter>([
  [highLevelCallLogAdapter.providerKey, highLevelCallLogAdapter],
  [hubSpotCallLogAdapter.providerKey, hubSpotCallLogAdapter]
]);

export function getExternalCallLogAdapter(providerKey: string) {
  return adapters.get(providerKey as ExternalCallLogProvider) ?? null;
}

export function listExternalCallLogAdapters() {
  return [...adapters.keys()];
}
