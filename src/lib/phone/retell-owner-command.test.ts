import { describe, expect, it, vi } from "vitest";
import { processRetellOwnerCommandTool } from "./retell-owner-command";

const body = JSON.stringify({
  name: "owner_business_action",
  tool_call_id: "tool-1",
  call: { call_id: "call-1", agent_id: "agent-owner", to_number: "+18882566005" },
  args: {
    original_instruction: "Send the invoice reminder.",
    explicit_approval: true,
    action_payload: {
      type: "send_message",
      channel: "sms",
      recipientType: "customer",
      recipientId: "d3b7755f-3d0d-4c93-9f1c-a1a0a2f78be9",
      message: "Your invoice is ready."
    }
  }
});

function dependencies() {
  return {
    resolveTenant: vi.fn().mockResolvedValue("tenant-1"),
    resolveApiKey: vi.fn().mockResolvedValue("retell-key"),
    verifySignature: vi.fn().mockReturnValue(true),
    resolveSession: vi.fn().mockResolvedValue({
      authSessionId: "e1293637-4024-4374-93ca-07809e80f4b4",
      conversationSessionId: "4be4181b-5585-48f6-883a-1ad36bf91a6b",
      brandId: null
    }),
    recordAction: vi.fn().mockResolvedValue({ ok: true, status: "queued", eventId: "event-1" })
  };
}

describe("Retell private owner command tool", () => {
  it("requires both a valid provider signature and a live private owner session", async () => {
    const invalidProvider = dependencies();
    invalidProvider.verifySignature.mockReturnValue(false);
    await expect(processRetellOwnerCommandTool(body, "bad", invalidProvider)).resolves.toMatchObject({ status: "blocked" });
    expect(invalidProvider.recordAction).not.toHaveBeenCalled();

    const publicCall = dependencies();
    publicCall.resolveSession.mockResolvedValue(null);
    await expect(processRetellOwnerCommandTool(body, "valid", publicCall)).resolves.toMatchObject({ status: "blocked" });
    expect(publicCall.recordAction).not.toHaveBeenCalled();
  });

  it("passes an authenticated explicit instruction into the common Ferocity action layer", async () => {
    const deps = dependencies();
    await expect(processRetellOwnerCommandTool(body, "valid", deps)).resolves.toMatchObject({ status: "queued" });
    expect(deps.recordAction).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      providerKey: "retell_voice",
      providerSessionId: "call-1",
      explicitApproval: true,
      secondaryConfirmation: false,
      idempotencyKey: "retell-owner:call-1:tool-1"
    }));
  });
});
