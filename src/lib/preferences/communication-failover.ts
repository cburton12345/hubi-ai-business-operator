import { queryPostgres } from "@/lib/db/postgres";
import type { CommunicationFallbackMode, CommunicationMethod } from "@/lib/preferences/communication-preferences";

export type CommunicationFailoverOffer = {
  method: CommunicationMethod;
  label: string;
  reason: string;
};

export function buildCommunicationFailoverOffers(input: {
  originalMethod: string;
  hasPhone: boolean;
  hasEmail: boolean;
}): CommunicationFailoverOffer[] {
  const offers: CommunicationFailoverOffer[] = [];
  if (input.hasPhone && input.originalMethod !== "native_sms") offers.push({ method: "native_sms", label: "Open SMS app", reason: "Uses the phone already on this device." });
  if (input.hasEmail && input.originalMethod !== "email") offers.push({ method: "email", label: "Use email", reason: "Keeps the conversation moving without the failed provider." });
  if (input.hasPhone) offers.push({ method: "human_call", label: "Call personally", reason: "Completes the action without an automation provider." });
  offers.push({ method: "copy_message", label: "Copy message", reason: "Works with any communication tool." });
  return offers;
}

export async function recordCommunicationFailover(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  originalMethod: string;
  reason: string;
  offers: CommunicationFailoverOffer[];
  mode?: CommunicationFallbackMode;
  selected?: CommunicationMethod | null;
  outcome?: "pending" | "selected" | "completed" | "failed" | "canceled";
}) {
  await queryPostgres(
    `insert into public.communication_failover_events (
       tenant_id, queue_id, original_provider_key, original_method, failure_reason,
       fallback_offered_json, fallback_selected, fallback_mode, final_outcome
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
    [
      input.tenantId, input.queueId, input.providerKey, input.originalMethod,
      input.reason, JSON.stringify(input.offers), input.selected ?? null,
      input.mode ?? "ask", input.outcome ?? "pending"
    ]
  );
}
