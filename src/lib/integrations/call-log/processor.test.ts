import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  deliver: vi.fn(),
  resolveSecrets: vi.fn(),
  secretByAliases: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/credentials/resolve-tenant-provider-secrets", () => ({
  resolveTenantProviderSecrets: mocks.resolveSecrets,
  secretByAliases: mocks.secretByAliases
}));
vi.mock("@/lib/integrations/call-log/registry", () => ({
  getExternalCallLogAdapter: () => ({ providerKey: "highlevel", deliver: mocks.deliver })
}));
vi.mock("@/lib/integrations/call-log/signed-webhook", () => ({ deliverSignedExternalCallLog: vi.fn() }));
vi.mock("@/lib/integrations/call-log/hubspot", () => ({ resolveHubSpotContactByPhone: vi.fn() }));

import { processExternalCallLogQueueForTenant } from "./processor";

const tenantId = "11111111-1111-4111-8111-111111111111";
const delivery = {
  id: "22222222-2222-4222-8222-222222222222",
  tenant_id: tenantId,
  connection_id: "33333333-3333-4333-8333-333333333333",
  call_id: "44444444-4444-4444-8444-444444444444",
  provider_key: "highlevel",
  external_contact_id: "contact-1",
  attempts: 1,
  delivery_mode: "native_api" as const,
  payload_json: {
    schemaVersion: 1,
    callId: "44444444-4444-4444-8444-444444444444",
    providerCallId: "provider-call-1",
    direction: "inbound",
    status: "completed",
    outcome: "qualified",
    summary: "Caller requested an estimate.",
    durationSeconds: 90,
    callerNumber: "+17155550199",
    qualification: "qualified",
    nextSteps: ["Prepare estimate"],
    appointmentId: null,
    customerId: null,
    leadId: "55555555-5555-4555-8555-555555555555",
    ferocityUrl: "https://ferocity.live/app/calls/44444444-4444-4444-8444-444444444444",
    completedAt: "2026-08-16T16:00:00.000Z"
  }
};

describe("external call-log queue processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSecrets.mockResolvedValue([]);
    mocks.secretByAliases.mockReturnValue("sealed-token");
  });

  it("delivers a claimed record and preserves the provider record id", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [delivery] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.deliver.mockResolvedValue({ externalRecordId: "note-1", providerResponse: { status: 201 } });

    await expect(processExternalCallLogQueueForTenant(tenantId, 1)).resolves.toEqual({
      checked: 1, delivered: 1, retried: 0, deadLettered: 0, blocked: 0
    });
    const completion = mocks.query.mock.calls.find(([sql]) => String(sql).includes("status='delivered'"));
    expect(completion?.[1]?.[1]).toBe("note-1");
  });

  it("uses bounded backoff when a provider delivery fails", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [delivery] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.deliver.mockRejectedValue(new Error("provider temporarily unavailable"));

    await expect(processExternalCallLogQueueForTenant(tenantId, 1)).resolves.toEqual({
      checked: 1, delivered: 0, retried: 1, deadLettered: 0, blocked: 0
    });
    const retry = mocks.query.mock.calls.find(([sql]) => String(sql).includes("status='retry'"));
    expect(retry?.[1]).toEqual([delivery.id, "provider temporarily unavailable", 60]);
  });

  it("dead-letters the fifth failed attempt instead of retrying forever", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ...delivery, attempts: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.deliver.mockRejectedValue(new Error("provider rejected delivery"));

    await expect(processExternalCallLogQueueForTenant(tenantId, 1)).resolves.toEqual({
      checked: 1, delivered: 0, retried: 0, deadLettered: 1, blocked: 0
    });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("status='dead_lettered'"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("integration_dead_letters"))).toBe(true);
  });
});
