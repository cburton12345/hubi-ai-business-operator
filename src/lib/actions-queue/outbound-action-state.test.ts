import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, ensureInvoiceReviewEnrollmentMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  ensureInvoiceReviewEnrollmentMock: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("@/lib/reviews/invoice-review-enrollment", () => ({
  ensureInvoiceReviewEnrollment: ensureInvoiceReviewEnrollmentMock,
}));

import { reconcileOutboundActionDelivery } from "./outbound-action-state";

describe("reconcileOutboundActionDelivery", () => {
  beforeEach(() => {
    queryPostgresMock.mockReset();
    ensureInvoiceReviewEnrollmentMock.mockReset();
  });

  it("advances a provider-queued action only after sent evidence arrives", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        id: "9d346b91-6db7-4b76-8848-5293cc45e291",
        action_type: "sms_send",
        target_type: null,
        target_id: null,
        recipient_label: "+17155550199",
        body: "Hello",
        status: "provider_queued",
      }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await reconcileOutboundActionDelivery({
      tenantId: "tenant-1",
      queueId: "9d346b91-6db7-4b76-8848-5293cc45e291",
      normalizedStatus: "sent",
      providerMessageId: "connect-job-1",
      isFinal: false,
    });

    expect(result).toEqual({ reconciled: true, actionId: "9d346b91-6db7-4b76-8848-5293cc45e291" });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("set status=$3"),
      expect.arrayContaining(["sent", expect.stringContaining('"providerMessageId":"connect-job-1"')]),
    );
  });

  it("records delivered transport evidence without completing the action twice", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{
        id: "9d346b91-6db7-4b76-8848-5293cc45e291",
        action_type: "sms_send",
        target_type: null,
        target_id: null,
        recipient_label: "+17155550199",
        body: "Hello",
        status: "sent",
      }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await reconcileOutboundActionDelivery({
      tenantId: "tenant-1",
      queueId: "9d346b91-6db7-4b76-8848-5293cc45e291",
      normalizedStatus: "delivered",
      providerMessageId: "connect-job-1",
      isFinal: true,
    });

    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.communication_messages"),
      ["tenant-1", "9d346b91-6db7-4b76-8848-5293cc45e291"],
    );
    expect(queryPostgresMock.mock.calls.filter(([sql]) => String(sql).includes("set status=$3"))).toHaveLength(0);
  });

  it("fails a waiting action only when provider failure is final", async () => {
    const action = {
      id: "9d346b91-6db7-4b76-8848-5293cc45e291",
      action_type: "sms_send",
      target_type: null,
      target_id: null,
      recipient_label: "+17155550199",
      body: "Hello",
      status: "provider_queued",
    };
    queryPostgresMock.mockResolvedValueOnce({ rows: [action] });
    await reconcileOutboundActionDelivery({
      tenantId: "tenant-1",
      queueId: action.id,
      normalizedStatus: "failed",
      providerMessageId: "connect-job-1",
      safeReason: "Carrier rejected the message.",
      isFinal: false,
    });
    expect(queryPostgresMock).toHaveBeenCalledTimes(1);

    queryPostgresMock.mockReset();
    queryPostgresMock.mockResolvedValueOnce({ rows: [action] }).mockResolvedValue({ rows: [], rowCount: 1 });
    await reconcileOutboundActionDelivery({
      tenantId: "tenant-1",
      queueId: action.id,
      normalizedStatus: "failed",
      providerMessageId: "connect-job-1",
      safeReason: "Carrier rejected the message.",
      isFinal: true,
    });
    expect(queryPostgresMock).toHaveBeenCalledWith(
      expect.stringContaining("set status=$3"),
      expect.arrayContaining(["failed", "Carrier rejected the message."]),
    );
  });
});
