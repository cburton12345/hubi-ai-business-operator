import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  marketplaceProOperationalCallbackSchema,
  requestMarketplaceProContractors,
  sendMarketplaceProOperationalCallback,
} from "./marketplacepro-network-outbound";

const config = {
  baseUrl: "https://marketplacepro.live/some/ignored/path",
  secret: "test-only-outbound-secret",
};

describe("MarketplacePro outbound contractor network", () => {
  it("uses a fixed intake endpoint and keeps the secret out of the body", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://marketplacepro.live/.netlify/functions/maintenance-opportunity-intake");
      expect(init?.headers).toMatchObject({ "x-ferocity-connect-token": config.secret });
      expect(init?.body).not.toContain(config.secret);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        external_event_id: "service-job:3b21bb5f-e058-4683-bce2-3be681ed48e8:v1",
        workers_needed: 1,
        required_insurance: {},
      });
      return Response.json({ ok: true, id: "request-a" });
    }) as typeof fetch;

    const result = await requestMarketplaceProContractors({
      externalOpportunityId: "3b21bb5f-e058-4683-bce2-3be681ed48e8",
      externalEventId: "service-job:3b21bb5f-e058-4683-bce2-3be681ed48e8:v1",
      clientName: "Ferocity customer",
      contactName: "Ferocity operations",
      city: "Milwaukee",
      state: "wi",
      trades: ["plumbing"],
      description: "Investigate and repair an active plumbing issue.",
      priority: "urgent",
      workersNeeded: 1,
      requiredInsurance: {},
      licensingRequirements: [],
    }, { config, fetcher });

    expect(result).toMatchObject({ ok: true, id: "request-a" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed without dedicated configuration and rejects non-HTTPS origins", async () => {
    const valid = {
      externalOpportunityId: "3b21bb5f-e058-4683-bce2-3be681ed48e8",
      externalEventId: "service-job:3b21bb5f-e058-4683-bce2-3be681ed48e8:v1",
      clientName: "Ferocity customer",
      contactName: "Ferocity operations",
      city: "Milwaukee",
      state: "WI",
      trades: ["plumbing"],
      description: "Investigate and repair an active plumbing issue.",
      priority: "normal" as const,
      workersNeeded: 1,
      requiredInsurance: {},
      licensingRequirements: [],
    };
    await expect(requestMarketplaceProContractors(valid, { config: {}, fetcher: vi.fn() })).rejects.toThrow("not configured");
    await expect(requestMarketplaceProContractors(valid, {
      config: { baseUrl: "http://marketplacepro.live", secret: config.secret },
      fetcher: vi.fn(),
    })).rejects.toThrow("HTTPS origin");
  });

  it("requires explicit acceptance for binding work and sends fixed callbacks", async () => {
    expect(marketplaceProOperationalCallbackSchema.safeParse({
      externalEventId: "job-acceptance-1",
      eventType: "job.accepted",
      laborRequestId: "cc2932a0-6f83-4f6f-a333-41f9597e19fe",
    }).success).toBe(false);

    const fetcher = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://marketplacepro.live/.netlify/functions/labor-connect-callback");
      return Response.json({ ok: true });
    }) as typeof fetch;
    await sendMarketplaceProOperationalCallback({
      externalEventId: "job-acceptance-1",
      eventType: "job.accepted",
      laborRequestId: "cc2932a0-6f83-4f6f-a333-41f9597e19fe",
      explicitAcceptance: true,
    }, { config, fetcher });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
