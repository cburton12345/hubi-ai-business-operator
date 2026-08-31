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
      providerMessageId: "event-id", sourceMessageId: "event-id", from: "+17155550199",
      body: "Hello", externalConversationRef: "ferocity-connect:device:+17155550199"
    });
    const [conversationSql, values] = queryPostgresMock.mock.calls[0];
    expect(String(conversationSql)).toContain("coalesce($11, $9::text");
    expect(String(conversationSql)).toContain("$9::uuid");
    expect(values[8]).toBeNull();
    expect(values[10]).toBe("ferocity-connect:device:+17155550199");
    const [, messageValues] = queryPostgresMock.mock.calls[1];
    expect(messageValues[2]).toBe("event-id");
  });
});
