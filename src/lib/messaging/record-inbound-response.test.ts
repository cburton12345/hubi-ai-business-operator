import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
import { recordInboundResponse } from "./record-inbound-response";

describe("recordInboundResponse", () => {
  beforeEach(() => queryPostgresMock.mockReset());

  it("uses a provider string conversation reference without putting it in the UUID thread field", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ id: "conversation-id" }] }).mockResolvedValue({ rows: [] });
    await recordInboundResponse({
      tenantId: "tenant", channel: "sms", providerKey: "ferocity_connect",
      providerMessageId: "event-id", from: "+17155550199",
      body: "Hello", externalConversationRef: "ferocity-connect:device:+17155550199"
    });
    const [conversationSql, values] = queryPostgresMock.mock.calls[0];
    expect(String(conversationSql)).toContain("coalesce($11, $9::text");
    expect(String(conversationSql)).toContain("$9::uuid");
    expect(values[8]).toBeNull();
    expect(values[10]).toBe("ferocity-connect:device:+17155550199");
    const [, messageValues] = queryPostgresMock.mock.calls[1];
    expect(messageValues[2]).toBeNull();
    expect(messageValues[5]).toBe("event-id");
  });

  it("preserves a real communication-message UUID as the optional source link", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ id: "conversation-id" }] }).mockResolvedValue({ rows: [] });
    await recordInboundResponse({
      tenantId: "tenant",
      channel: "email",
      providerKey: "resend_email",
      providerMessageId: "provider-event",
      sourceMessageId: "00000000-0000-4000-8000-000000000010",
      from: "person@example.com",
      body: "Hello",
    });
    const [, messageValues] = queryPostgresMock.mock.calls[1];
    expect(messageValues[2]).toBe("00000000-0000-4000-8000-000000000010");
  });

  it("stops queued outreach by normalized address and authoritative lead or customer linkage", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ id: "conversation-id" }] }).mockResolvedValue({ rows: [] });
    await recordInboundResponse({
      tenantId: "tenant",
      leadId: "00000000-0000-4000-8000-000000000011",
      customerId: "00000000-0000-4000-8000-000000000012",
      channel: "sms",
      providerKey: "ferocity_connect",
      from: "+1 (715) 555-0199",
      body: "Please call me tomorrow.",
    });

    const cancellationCall = queryPostgresMock.mock.calls.find(([sql]) =>
      String(sql).includes("update public.outbound_action_queue"),
    );
    expect(cancellationCall).toBeDefined();
    expect(String(cancellationCall?.[0])).toContain("regexp_replace");
    expect(String(cancellationCall?.[0])).toContain("target_type = 'follow_up_workflow'");
    expect(String(cancellationCall?.[0])).toContain("target_type = 'communication_message'");
    expect(String(cancellationCall?.[0])).toContain("target_type = 'messaging_conversation'");
    expect(cancellationCall?.[1]).toEqual([
      "tenant",
      "conversation-id",
      "+1 (715) 555-0199",
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ]);
  });
});
