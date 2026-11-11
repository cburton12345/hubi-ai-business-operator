import { describe, expect, it, vi } from "vitest";
import type { MarketplaceProQuery } from "./marketplacepro-delivery-store";

vi.mock("server-only", () => ({}));

import { getMarketplaceProVendorPhoneReadiness } from "./marketplacepro-vendor-readiness";

describe("MarketplacePro vendor phone readiness", () => {
  it("scopes every inventory query to the selected tenant and exposes blockers", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const query = (async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("from public.phone_connections")) return { rows: [{ id: "connection-a", status: "needs_attention", intended_use: "receptionist", phone_provider_key: "retell_voice", voice_agent_provider_key: "retell_voice", business_number: null, ferocity_number: "+17155554498" }] };
      if (text.includes("from public.telephony_numbers")) return { rows: [{ id: "number-a", phone_number: "+17155554498", provider_key: "retell_voice", number_mode: "ferocity_managed", status: "needs_attention", inbound_enabled: true, outbound_enabled: false, compliance_status: "ready" }] };
      if (text.includes("from public.provider_accounts")) return { rows: [{ provider_key: "retell_voice", status: "connected", credentials_status: "configured", live_actions_enabled: true, has_assistant_id: true }] };
      return { rows: [] };
    }) as MarketplaceProQuery;
    const result = await getMarketplaceProVendorPhoneReadiness("tenant-a", query);
    expect(calls.every((call) => call.text.includes("tenant_id=$1") && call.values[0] === "tenant-a")).toBe(true);
    expect(result.inboundReady).toBe(false);
    expect(result.outboundReady).toBe(false);
    expect(result.vendorRelationsReady).toBe(false);
    expect(result.blockers).toContain("The voice-orchestrator route is not active.");
  });
});
