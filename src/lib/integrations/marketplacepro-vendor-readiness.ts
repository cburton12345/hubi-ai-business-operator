import "server-only";
import { queryPostgres } from "@/lib/db/postgres";
import type { MarketplaceProQuery } from "@/lib/integrations/marketplacepro-delivery-store";

type PhoneRow = {
  id: string;
  phone_number: string;
  provider_key: string;
  number_mode: string;
  status: string;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  compliance_status: string;
  has_assistant_id: boolean;
};

type ConnectionRow = {
  id: string;
  status: string;
  intended_use: string | null;
  phone_provider_key: string | null;
  voice_agent_provider_key: string | null;
  business_number: string | null;
  ferocity_number: string | null;
};

type ProviderRow = {
  provider_key: string;
  status: string;
  credentials_status: string;
  live_actions_enabled: boolean;
  has_assistant_id: boolean;
};

type RouteRow = {
  primary_provider_key: string;
  fallback_provider_key: string | null;
  status: string;
  live_actions_enabled: boolean;
};

export type MarketplaceProVendorPhoneReadiness = {
  brandId: string | null;
  phoneConnection: ConnectionRow | null;
  numbers: PhoneRow[];
  providers: ProviderRow[];
  voiceRoute: RouteRow | null;
  phoneIntakeBridgeReady: boolean;
  inboundReady: boolean;
  outboundReady: boolean;
  vendorRelationsReady: boolean;
  blockers: string[];
};

export async function getMarketplaceProVendorPhoneReadiness(
  tenantId: string,
  query: MarketplaceProQuery = queryPostgres,
): Promise<MarketplaceProVendorPhoneReadiness> {
  const brandResult = await query<{ id: string }>(
    `select id from public.brands where tenant_id=$1 and slug='diamond-homes' and status='active' limit 1`,
    [tenantId],
  );
  const brandId = brandResult?.rows[0]?.id ?? null;
  const [connectionResult, numberResult, providerResult, routeResult] = await Promise.all([
    query<ConnectionRow>(
      `select id,status,intended_use,phone_provider_key,voice_agent_provider_key,business_number,ferocity_number
       from public.phone_connections where tenant_id=$1 limit 1`,
      [tenantId],
    ),
    query<PhoneRow>(
      `select id,phone_number,provider_key,number_mode,status,inbound_enabled,outbound_enabled,compliance_status,
              (metadata_json ? 'assistantId') as has_assistant_id
       from public.telephony_numbers where tenant_id=$1 and brand_id=$2 and status <> 'released' order by created_at desc`,
      [tenantId, brandId],
    ),
    query<ProviderRow>(
      `select provider_key,status,credentials_status,live_actions_enabled,
              (metadata_json ? 'assistantId') as has_assistant_id
       from public.provider_accounts
       where tenant_id=$1 and provider_key in ('retell_voice','twilio_voice','twilio_phone','ferocity_managed_phone')
       order by provider_key`,
      [tenantId],
    ),
    query<RouteRow>(
      `select primary_provider_key,fallback_provider_key,status,live_actions_enabled
       from public.voice_provider_routes where tenant_id=$1 and brand_id=$2 and route_family='voice_orchestrator' limit 1`,
      [tenantId, brandId],
    ),
  ]);
  const phoneConnection = connectionResult?.rows[0] ?? null;
  const numbers = numberResult?.rows ?? [];
  const providers = providerResult?.rows ?? [];
  const voiceRoute = routeResult?.rows[0] ?? null;
  const activeInbound = numbers.some((number) => number.status === "active" && number.inbound_enabled && number.has_assistant_id);
  const activeOutbound = numbers.some((number) => number.status === "active" && number.outbound_enabled && number.has_assistant_id);
  const provider = providers.find((row) => row.provider_key === (voiceRoute?.primary_provider_key ?? phoneConnection?.voice_agent_provider_key));
  const providerReady = Boolean(provider && provider.status === "connected" && provider.credentials_status === "configured" && provider.live_actions_enabled && provider.has_assistant_id);
  const routeReady = Boolean(voiceRoute && voiceRoute.status === "active" && voiceRoute.live_actions_enabled);
  let phoneIntakeBaseUrlReady = false;
  try {
    const origin = new URL(process.env.MARKETPLACEPRO_PHONE_INTAKE_BASE_URL ?? "");
    phoneIntakeBaseUrlReady = origin.protocol === "https:" && !origin.username && !origin.password;
  } catch {
    phoneIntakeBaseUrlReady = false;
  }
  const phoneIntakeBridgeReady = phoneIntakeBaseUrlReady && (process.env.MARKETPLACEPRO_PHONE_INTAKE_SECRET?.length ?? 0) >= 32;
  const blockers: string[] = [];
  if (!brandId) blockers.push("The Diamond Homes operating brand is not configured in this workspace.");
  if (!phoneConnection) blockers.push("No Ferocity phone connection is assigned to this workspace.");
  else if (!["ready", "active"].includes(phoneConnection.status)) blockers.push(`Phone connection is ${phoneConnection.status.replaceAll("_", " ")}.`);
  if (!activeInbound) blockers.push("No active inbound-enabled number is certified.");
  if (!activeOutbound) blockers.push("No active outbound-enabled number is certified.");
  if (!providerReady) blockers.push("The selected voice provider is not fully connected for live actions.");
  if (!routeReady) blockers.push("The voice-orchestrator route is not active.");
  if (!phoneIntakeBridgeReady) blockers.push("The dedicated MarketplacePro phone-intake bridge is not configured in this release.");
  return {
    brandId,
    phoneConnection,
    numbers,
    providers,
    voiceRoute,
    phoneIntakeBridgeReady,
    inboundReady: activeInbound && providerReady && routeReady,
    outboundReady: activeOutbound && providerReady && routeReady,
    vendorRelationsReady: activeInbound && activeOutbound && providerReady && routeReady && phoneIntakeBridgeReady && blockers.length === 0,
    blockers,
  };
}
