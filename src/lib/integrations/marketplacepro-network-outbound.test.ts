import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  marketplaceProOperationalCallbackSchema,
  claimMarketplaceProVendorOutreach,
  reportMarketplaceProVendorOutreachResult,
  requestMarketplaceProContractors,
  sendMarketplaceProOperationalCallback,
  submitMarketplaceProPhoneIntake,
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

  it("claims only bounded approved outreach and reports provider outcomes", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("facility-vendor-outreach-claim")) {
        return Response.json({ ok: true, outreach: [{
          id: "cae1293b-0c19-41d6-af3f-8c3396e65878",
          prospect_id: "06b54364-7ed4-4c34-8f57-b8ce9d694fd0",
          application_id: null,
          channel: "email",
          recipient: "vendor@example.com",
          subject: "Vendor application",
          message_body: "Approved vendor application inquiry.",
          purpose: "initial_application",
          status: "queued",
          idempotency_key: "vendor:06b54364:initial:1",
          attempt_count: 1,
        }] });
      }
      expect(String(url).endsWith("/.netlify/functions/facility-vendor-outreach-result")).toBe(true);
      return Response.json({ ok: true });
    }) as typeof fetch;
    const claimed = await claimMarketplaceProVendorOutreach(10, { config, fetcher });
    expect(claimed).toHaveLength(1);
    await reportMarketplaceProVendorOutreachResult({
      outreachId: claimed[0].id,
      status: "sent",
      providerMessageId: "provider-message-1",
    }, { config, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sends idempotent Diamond phone intake to a fixed endpoint without implying acceptance", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://marketplacepro.live/.netlify/functions/ferocity-phone-intake");
      expect(init?.headers).toMatchObject({ "x-ferocity-connect-token": config.secret });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        idempotencyKey: "retell:call-123:contractor",
        externalCallId: "call-123",
        intakeType: "contractor",
        consentToContact: true,
      });
      expect(String(init?.body)).not.toContain(config.secret);
      return Response.json({
        ok: true,
        intakeId: "46bfab36-77b5-4bcb-a0f0-810b2ef28e5b",
        intakeType: "contractor",
        status: "routed",
        duplicate: false,
        contractorRecruitingLeadId: "a0ce296b-bb5f-4e19-9c2b-c02b31d5cdde",
        laborRequestId: null,
        facilityProspectId: null,
        bindingWorkOrderAccepted: false,
      });
    }) as typeof fetch;

    await expect(submitMarketplaceProPhoneIntake({
      idempotencyKey: "retell:call-123:contractor",
      externalCallId: "call-123",
      intakeType: "contractor",
      callerName: "Contractor",
      phone: "+17155550123",
      trades: ["plumbing"],
      summary: "Interested in Wisconsin maintenance work.",
      urgency: "normal",
      consentToContact: true,
    }, { config, fetcher })).resolves.toMatchObject({ status: "routed", bindingWorkOrderAccepted: false });
  });

  it("requires complete opportunity and vendor phone intake before calling MarketplacePro", async () => {
    const fetcher = vi.fn() as typeof fetch;
    await expect(submitMarketplaceProPhoneIntake({
      idempotencyKey: "retell:call-456:opportunity",
      externalCallId: "call-456",
      intakeType: "opportunity",
      callerName: "Site manager",
      trades: [],
      summary: "Needs service.",
      urgency: "high",
      consentToContact: false,
    }, { config, fetcher })).rejects.toThrow("Opportunity intake requires");
    await expect(submitMarketplaceProPhoneIntake({
      idempotencyKey: "retell:call-789:vendor",
      externalCallId: "call-789",
      intakeType: "vendor",
      callerName: "Vendor contact",
      trades: [],
      summary: "Calling about vendor enrollment.",
      urgency: "normal",
      consentToContact: false,
    }, { config, fetcher })).rejects.toThrow("Vendor intake requires");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
