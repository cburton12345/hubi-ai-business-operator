import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, sendMessageMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  sendMessageMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: queryPostgresMock
}));

vi.mock("@/lib/messaging/messaging-engine", () => ({
  sendMessage: sendMessageMock
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
};

describe("processReadyMessagesForTenant", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    sendMessageMock.mockReset();
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

    expect(result).toEqual({ checked: 1, sent: 1, blocked: 0, failed: 0 });
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

    expect(result).toEqual({ checked: 1, sent: 0, blocked: 1, failed: 0 });
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

    expect(result).toEqual({ checked: 1, sent: 0, blocked: 0, failed: 1 });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("communication_failover_events"),
      expect.arrayContaining(["Provider unavailable", "ask", "pending"])
    );
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

    expect(result).toEqual({ checked: 1, sent: 1, blocked: 0, failed: 0 });
    expect(sendMessageMock).toHaveBeenCalledOnce();
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
