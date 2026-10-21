import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, sendMessageMock, beginCapabilityExecutionMock, recordCapabilityExecutionStateMock, recordCapabilityProviderResultMock, recordCapabilityCircuitResultMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  sendMessageMock: vi.fn(),
  beginCapabilityExecutionMock: vi.fn(),
  recordCapabilityExecutionStateMock: vi.fn(),
  recordCapabilityProviderResultMock: vi.fn(),
  recordCapabilityCircuitResultMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: queryPostgresMock
}));

vi.mock("@/lib/messaging/messaging-engine", () => ({
  sendMessage: sendMessageMock
}));

vi.mock("@/lib/reliability/capability-runtime", () => ({
  capabilityForQueuedAction: ({ actionType }: { actionType: string }) => actionType === "email_send" ? "email_follow_up" : "sms_follow_up",
  beginCapabilityExecution: beginCapabilityExecutionMock,
  recordCapabilityExecutionState: recordCapabilityExecutionStateMock,
  recordCapabilityProviderResult: recordCapabilityProviderResultMock,
  recordCapabilityCircuitResult: recordCapabilityCircuitResultMock
}));

import { processReadyMessagesForTenant } from "./process-ready-messages";

const readyEmail = {
  id: "a1",
  action_type: "email_send",
  provider_key: "resend_shared",
  recipient_label: "lead@example.com",
  subject: "Appointment reminder",
  body: "We are scheduled tomorrow.",
  target_type: "revenue_appointment_reminder",
  target_id: "r1",
  policy_status: "live",
  requires_human_approval: false,
  retry_count: 0
  ,queue_status: "queued"
  ,communication_method: "email"
  ,fallback_mode: "ask"
  ,fallback_method: "native_sms"
  ,contact_email: "lead@example.com"
  ,contact_phone: "5550101"
  ,workflow_type: null
  ,approved_by_user_id: null
  ,metadata_json: null
};

describe("processReadyMessagesForTenant", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    sendMessageMock.mockReset();
    beginCapabilityExecutionMock.mockReset();
    recordCapabilityExecutionStateMock.mockReset();
    recordCapabilityProviderResultMock.mockReset();
    recordCapabilityCircuitResultMock.mockReset();
    beginCapabilityExecutionMock.mockResolvedValue({
      auditId: "audit-1",
      shouldProceed: true,
      enforced: false,
      authorization: { allowed: true, basis: "automation_policy" },
      readiness: { ready: true, health: "healthy", blockers: [], warnings: [] },
      trustLevel: "trusted"
    });
    recordCapabilityExecutionStateMock.mockResolvedValue({ updated: true });
    recordCapabilityProviderResultMock.mockResolvedValue({ updated: true });
    recordCapabilityCircuitResultMock.mockResolvedValue({ state: "closed" });
  });

  it("sends an authorized, consented message through the guarded messaging engine", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [readyEmail] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: true,
      providerKey: "resend_email",
      providerMessageId: "provider-1",
      status: "sent"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 1, providerQueued: 0, blocked: 0, failed: 0 });
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      channel: "email",
      to: "lead@example.com",
      providerKey: "resend_email",
      idempotencyKey: "outbound-action:a1",
      authorization: {
        source: "live_action_policy",
        humanApproved: false,
        policyAllowsAuto: true
      }
    }));
  });

  it("blocks an automatic message when contact consent is missing", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [readyEmail] })
      .mockResolvedValueOnce({ rows: [{ status: "unknown", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 0, providerQueued: 0, blocked: 1, failed: 0 });
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.outbound_action_queue"),
      expect.arrayContaining(["EMAIL consent is not granted."])
    );
  });

  it("uses a new idempotency key after an approved retry", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ ...readyEmail, retry_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: true,
      providerKey: "resend_email",
      providerMessageId: "provider-2",
      status: "sent"
    });

    await processReadyMessagesForTenant("tenant-1");

    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "outbound-action:a1:attempt:1"
    }));
  });

  it("preserves H4R bridge context and its canonical idempotency key through execution", async () => {
    const h4rMetadata = {
      source: "h4r",
      h4rCanonicalIdempotencyKey: "h4r:workspace-1:outbox-1",
      h4rCallbackUrl: "https://h4r.example/functions/v1/ferocity-sms-callback",
      h4rWorkspaceId: "workspace-1",
      h4rSmsOutboxId: "outbox-1",
      messagePurpose: "tenant_notice",
      enforceQuietHours: true,
      aiGenerated: false
    };
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        ...readyEmail,
        action_type: "sms_send",
        provider_key: "ferocity_connect",
        recipient_label: "+17155550199",
        metadata_json: h4rMetadata
      }] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: true,
      providerKey: "ferocity_connect",
      providerMessageId: "connect-job-1",
      status: "queued"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 0, providerQueued: 1, blocked: 0, failed: 0 });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.outbound_action_queue"),
      expect.arrayContaining(["provider_queued"])
    );
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "h4r:workspace-1:outbox-1",
      providerKey: "ferocity_connect",
      metadata: expect.objectContaining(h4rMetadata)
    }));
  });

  it("records explicit alternatives when a provider fails", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [readyEmail] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: false,
      providerKey: "resend_email",
      status: 503,
      retryable: true,
      error: "Provider unavailable"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 0, providerQueued: 0, blocked: 0, failed: 1 });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("communication_failover_events"),
      expect.arrayContaining(["Provider unavailable", "ask", "pending"])
    );
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.outbound_action_queue"),
      expect.arrayContaining([expect.stringContaining('"retryable":true')])
    );
  });

  it("does not send when the capability trust envelope denies execution", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [readyEmail] }).mockResolvedValue({ rows: [], rowCount: 1 });
    beginCapabilityExecutionMock.mockResolvedValueOnce({
      auditId: "audit-blocked",
      shouldProceed: false,
      enforced: true,
      authorization: { allowed: false, reason: "Workspace policy does not authorize this send." },
      readiness: { ready: true, health: "healthy", blockers: [], warnings: [] },
      trustLevel: "supervised"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 0, providerQueued: 0, blocked: 1, failed: 0 });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("allows a transactional invoice reminder without marketing consent but still honors suppression", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        ...readyEmail,
        target_type: "follow_up_workflow",
        target_id: "followup-1",
        workflow_type: "invoice_followup",
        subject: "Invoice reminder"
      }] })
      .mockResolvedValueOnce({ rows: [{ status: "unknown", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: true,
      providerKey: "resend_email",
      providerMessageId: "provider-invoice-1",
      status: "sent"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result).toEqual({ checked: 1, sent: 1, providerQueued: 0, blocked: 0, failed: 0 });
    expect(sendMessageMock).toHaveBeenCalledOnce();
  });

  it("advances authoritative lead and conversation state after a workflow message sends", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        ...readyEmail,
        target_type: "follow_up_workflow",
        target_id: "followup-1",
        workflow_type: "new_lead_response"
      }] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ enrollment_id: null, lead_id: "lead-1", customer_id: "customer-1", workflow_type: "new_lead_response" }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({
      ok: true,
      providerKey: "resend_email",
      providerMessageId: "provider-lead-1",
      status: "sent"
    });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result.sent).toBe(1);
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("set status=case when status='new' then 'contacted'"),
      ["tenant-1", "lead-1"]
    );
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("status='waiting_on_customer'"),
      expect.arrayContaining(["provider-lead-1", "a1", "new_lead_response"])
    );
  });

  it("closes owner response pressure after an authorized inbound reply is sent", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ ...readyEmail, target_type: "messaging_conversation", target_id: "conversation-1" }] })
      .mockResolvedValueOnce({ rows: [{ status: "granted", suppressed: false }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    sendMessageMock.mockResolvedValue({ ok: true, providerKey: "resend_email", providerMessageId: "reply-1", status: "sent" });

    await processReadyMessagesForTenant("tenant-1");

    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("set status='waiting_on_customer',unread_count=0"),
      ["tenant-1", "conversation-1"]
    );
  });

  it("blocks a transactional invoice reminder for a suppressed address", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ ...readyEmail, workflow_type: "invoice_followup" }] })
      .mockResolvedValueOnce({ rows: [{ status: "unknown", suppressed: true }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await processReadyMessagesForTenant("tenant-1");

    expect(result.blocked).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
