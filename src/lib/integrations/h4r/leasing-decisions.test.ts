import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock: Record<string, string | undefined> = {
  H4R_LEASING_DECISION_URL: "https://h4r.example/functions/v1/ferocity-leasing-decision",
  H4R_SMS_BRIDGE_SECRET: "h4r-test-secret-that-is-long-enough",
};

vi.mock("@/lib/env", () => ({ env: envMock }));

describe("H4R leasing decision client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMock.H4R_LEASING_DECISION_URL = "https://h4r.example/functions/v1/ferocity-leasing-decision";
    envMock.H4R_SMS_BRIDGE_SECRET = "h4r-test-secret-that-is-long-enough";
  });

  it("fails closed when the connection is not configured", async () => {
    envMock.H4R_LEASING_DECISION_URL = undefined;
    const { applyH4rLeasingDecision } = await import("./leasing-decisions");
    await expect(applyH4rLeasingDecision({
      externalEventId: "h4r:owner-notification:11111111-1111-4111-8111-111111111111",
      decision: "hold",
      idempotencyKey: "decision-1",
    })).resolves.toEqual({ ok: false, skipped: true, reason: "not_configured" });
  });

  it("signs an explicit owner-approved reply and preserves idempotency", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      queued: true,
      duplicate: false,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { applyH4rLeasingDecision } = await import("./leasing-decisions");
    const result = await applyH4rLeasingDecision({
      externalEventId: "h4r:owner-notification:11111111-1111-4111-8111-111111111111",
      decision: "edit_and_send",
      replyBody: "Yes, it is available. Would tomorrow afternoon work for a showing?",
      idempotencyKey: "decision-2",
    });

    expect(result).toEqual({ ok: true, skipped: false, decision: "edit_and_send", queued: true, duplicate: false });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual(expect.objectContaining({
      "x-h4r-signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      "x-h4r-nonce": expect.any(String),
    }));
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      decision: "edit_and_send",
      idempotency_key: "decision-2",
    }));
  });

  it("rejects non-H4R events before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { applyH4rLeasingDecision } = await import("./leasing-decisions");
    const result = await applyH4rLeasingDecision({
      externalEventId: "other:event:1",
      decision: "approve",
      idempotencyKey: "decision-3",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, retryable: false }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
