import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, generateJsonMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  generateJsonMock: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("@/lib/ai/ai-service", () => ({ generateJsonWithAiService: generateJsonMock }));

import { prepareInboundReply } from "./prepare-inbound-reply";

describe("prepareInboundReply", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    generateJsonMock.mockReset();
  });

  it("queues a confident email reply only under a live no-approval policy", async () => {
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (sql.includes("select t.name tenant_name")) return { rows: [{ tenant_name: "Acme", brand_name: null, description: "Repairs", industry: "home services" }] };
      if (sql.includes("select direction,body")) return { rows: [{ direction: "inbound", body: "Tuesday works" }] };
      if (sql.includes("from public.live_action_policies")) return { rows: [{ id: "policy-1", status: "live", requires_human_approval: false }] };
      if (sql.includes("insert into public.outbound_action_queue")) return { rows: [{ id: "queue-1" }] };
      return { rows: [] };
    });
    generateJsonMock.mockResolvedValue({ reply: "Tuesday works. What time is best?", confidence: 96, requiresHuman: false, reason: "Simple scheduling clarification." });

    const result = await prepareInboundReply({
      tenantId: "tenant-1", brandId: "brand-1", conversationId: "conversation-1",
      inboundMessageId: "inbound-1", channel: "email", providerKey: "resend_email",
      from: "lead@example.com", subject: "Re: repair", body: "Tuesday works",
    });

    expect(result.mode).toBe("queued_by_explicit_policy");
    const queueCall = queryPostgresMock.mock.calls.find(([sql]) => String(sql).includes("insert into public.outbound_action_queue"));
    expect(queueCall?.[1]).toEqual(expect.arrayContaining(["email_send", "Re: repair"]));
  });

  it("keeps low-confidence or consequential replies in review", async () => {
    queryPostgresMock.mockImplementation(async (sql: string) => {
      if (sql.includes("select t.name tenant_name")) return { rows: [{ tenant_name: "Acme", brand_name: null, description: null, industry: null }] };
      if (sql.includes("select direction,body")) return { rows: [] };
      if (sql.includes("from public.live_action_policies")) return { rows: [{ id: "policy-1", status: "live", requires_human_approval: false }] };
      if (sql.includes("insert into public.outbound_action_queue")) return { rows: [{ id: "queue-2" }] };
      return { rows: [] };
    });
    generateJsonMock.mockResolvedValue({ reply: "A person needs to review this.", confidence: 72, requiresHuman: true, reason: "Pricing decision requested." });

    const result = await prepareInboundReply({
      tenantId: "tenant-1", conversationId: "conversation-2", inboundMessageId: "inbound-2",
      channel: "email", providerKey: "resend_email", from: "lead@example.com",
      subject: "Price guarantee", body: "Guarantee this price?",
    });

    expect(result.mode).toBe("prepared_for_review");
    const queueCall = queryPostgresMock.mock.calls.find(([sql]) => String(sql).includes("insert into public.outbound_action_queue"));
    expect(queueCall?.[1]).toEqual(expect.arrayContaining(["needs_review", "high"]));
  });
});
