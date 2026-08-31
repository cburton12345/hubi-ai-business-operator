import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmailWithResend: vi.fn(),
  logAppError: vi.fn()
}));

vi.mock("@/lib/email/resend", () => ({ sendEmailWithResend: mocks.sendEmailWithResend }));
vi.mock("@/lib/observability/log-error", () => ({ logAppError: mocks.logAppError }));

import { sendTransactionalEmail } from "./transactional";

describe("transactional email idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmailWithResend.mockResolvedValue({
      ok: true,
      providerKey: "resend_email",
      providerMessageId: "email-1"
    });
  });

  it("reuses the key for an identical logical email retry", async () => {
    const input = {
      to: "owner@example.com",
      subject: "Workspace ready",
      text: "Your workspace is ready.",
      tenantId: "tenant-1",
      eventKey: "access_request_confirmation"
    };

    await sendTransactionalEmail(input);
    await sendTransactionalEmail(input);

    expect(mocks.sendEmailWithResend.mock.calls[0][0].queueId).toBe(
      mocks.sendEmailWithResend.mock.calls[1][0].queueId
    );
  });

  it("uses a different key when the recipient or message changes", async () => {
    await sendTransactionalEmail({
      to: "first@example.com",
      subject: "Workspace ready",
      text: "First workspace is ready.",
      tenantId: "tenant-1",
      eventKey: "access_request_confirmation"
    });
    await sendTransactionalEmail({
      to: "second@example.com",
      subject: "Workspace ready",
      text: "Second workspace is ready.",
      tenantId: "tenant-1",
      eventKey: "access_request_confirmation"
    });

    expect(mocks.sendEmailWithResend.mock.calls[0][0].queueId).not.toBe(
      mocks.sendEmailWithResend.mock.calls[1][0].queueId
    );
  });
});
