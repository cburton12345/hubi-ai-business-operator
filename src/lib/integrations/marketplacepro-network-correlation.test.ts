import { describe, expect, it } from "vitest";
import type { MarketplaceProDeliveryConnection } from "./marketplacepro-delivery";
import type { MarketplaceProQuery } from "./marketplacepro-delivery-store";
import { recordMarketplaceProEvent } from "./marketplacepro";

const connection: MarketplaceProDeliveryConnection = {
  id: "connection-a",
  tenantId: "tenant-a",
  brandId: "brand-a",
  sourceAccountId: "account-a",
  profileMode: "ferocity_connected",
  connectionStatus: "connected",
  syncStatus: "ready",
  pilotEnabled: true,
  contractVersion: "2026-10-22.v1",
  credentialLabel: "owner_pilot_webhook_secret",
};

describe("MarketplacePro network event correlation", () => {
  it("links a contractor event to an exact tenant-scoped Ferocity service job", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const jobId = "3b21bb5f-e058-4683-bce2-3be681ed48e8";
    const query = (async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("from public.service_jobs")) return { rows: [{ id: jobId }] };
      if (text.includes("returning id")) return { rows: [{ id: "timeline-a" }] };
      return { rows: [] };
    }) as MarketplaceProQuery;

    await recordMarketplaceProEvent({
      marketplaceTable: "worker_matches",
      marketplaceObjectId: "match-a",
      eventType: "contractor_matches_found",
      payload: { externalOpportunityId: jobId, eligibleCount: 2 },
    }, { connection, query });

    const jobLookup = calls.find((call) => call.text.includes("from public.service_jobs"));
    expect(jobLookup?.text).toContain("where tenant_id = $1 and id = $2");
    expect(jobLookup?.values).toEqual(["tenant-a", jobId]);
    const timeline = calls.find((call) => call.text.includes("insert into public.operator_timeline_events"));
    expect(timeline?.values).toContain("job");
    expect(timeline?.values).toContain(jobId);
    const link = calls.find((call) => call.text.includes("insert into public.marketplacepro_object_links"));
    expect(link?.values).toContain("service_job");
    expect(link?.values).toContain(jobId);
  });

  it("never queries or links a malformed external opportunity ID", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const query = (async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("returning id")) return { rows: [{ id: "timeline-a" }] };
      return { rows: [] };
    }) as MarketplaceProQuery;

    await recordMarketplaceProEvent({
      marketplaceTable: "worker_matches",
      marketplaceObjectId: "match-a",
      payload: { externalOpportunityId: "not-a-job" },
    }, { connection, query });

    expect(calls.some((call) => call.text.includes("from public.service_jobs"))).toBe(false);
    const link = calls.find((call) => call.text.includes("insert into public.marketplacepro_object_links"));
    expect(link?.values).toContain("timeline_event");
    expect(link?.values).toContain("timeline-a");
  });
});
