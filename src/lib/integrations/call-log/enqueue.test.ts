import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres, safeLogAppError } = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  safeLogAppError: vi.fn()
}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));
vi.mock("@/lib/observability/log-error", () => ({ safeLogAppError }));

import { enqueueExternalCallLogHandoffs, safelyEnqueueExternalCallLogHandoffs } from "./enqueue";

const input = {
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  callId: "11111111-1111-4111-8111-111111111111",
  providerCallId: "provider-call-1",
  direction: "inbound" as const,
  status: "completed",
  outcome: "qualified",
  summary: "Caller requested an inspection.",
  durationSeconds: 90,
  callerNumber: "+17155550100",
  qualification: "hot",
  actionItems: [{ title: "Book inspection" }],
  customerId: "22222222-2222-4222-8222-222222222222",
  leadId: null
};

describe("external call-log enqueue", () => {
  beforeEach(() => {
    queryPostgres.mockReset();
    safeLogAppError.mockReset();
  });

  it("queues one idempotent delivery for an enabled mapped connection", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{ connection_id: "33333333-3333-4333-8333-333333333333", provider_key: "highlevel", external_contact_id: "contact-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(enqueueExternalCallLogHandoffs(input)).resolves.toEqual({ connections: 1, queued: 1, needsMapping: 0 });
    const insertArgs = queryPostgres.mock.calls[1][1] as unknown[];
    expect(insertArgs[5]).toBe("queued");
    expect(insertArgs[6]).toBe("external-call-log:33333333-3333-4333-8333-333333333333:11111111-1111-4111-8111-111111111111");
    const payload = JSON.parse(String(insertArgs[7]));
    expect(payload.nextSteps).toEqual(["Book inspection"]);
    expect(payload).not.toHaveProperty("transcript");
  });

  it("marks an unmapped contact for review instead of creating provider records", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{ connection_id: "33333333-3333-4333-8333-333333333333", provider_key: "highlevel", external_contact_id: null }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(enqueueExternalCallLogHandoffs(input)).resolves.toEqual({ connections: 1, queued: 0, needsMapping: 1 });
    expect(queryPostgres.mock.calls[1][1][5]).toBe("needs_mapping");
  });

  it("isolates queue failures from the completed call", async () => {
    queryPostgres.mockRejectedValueOnce(new Error("database unavailable"));
    const result = await safelyEnqueueExternalCallLogHandoffs(input);
    expect(result).toMatchObject({ queued: 0, error: "database unavailable" });
    expect(safeLogAppError).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ isolatedFromCall: true }) }));
  });
});
