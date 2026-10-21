import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock: Record<string, string | undefined> = {
  H4R_OPERATOR_URL: "https://h4r.example/functions/v1/ferocity-autonomous-operator",
  H4R_SMS_BRIDGE_SECRET: "h4r-test-secret-that-is-long-enough",
  H4R_OPERATOR_MODE: "prepare",
};

vi.mock("@/lib/env", () => ({ env: envMock }));

describe("H4R autonomous operator client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMock.H4R_OPERATOR_URL = "https://h4r.example/functions/v1/ferocity-autonomous-operator";
    envMock.H4R_SMS_BRIDGE_SECRET = "h4r-test-secret-that-is-long-enough";
    envMock.H4R_OPERATOR_MODE = "prepare";
  });

  it("skips honestly when the operator is not configured", async () => {
    envMock.H4R_OPERATOR_URL = undefined;
    const { runH4rAutonomousOperator } = await import("./operator");
    await expect(runH4rAutonomousOperator()).resolves.toEqual({ ok: true, skipped: true, reason: "not_configured" });
  });

  it("signs one stable run key and reports the durable H4R run", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      skipped: false,
      run_id: "run-1",
      status: "completed",
      mode_limited: false,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { runH4rAutonomousOperator } = await import("./operator");
    const result = await runH4rAutonomousOperator();

    expect(result).toEqual({ ok: true, skipped: false, status: "completed", runId: "run-1", mode: "prepare", modeLimited: false });
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(envMock.H4R_OPERATOR_URL);
    const init = request?.[1] as RequestInit;
    expect(init.headers).toEqual(expect.objectContaining({
      "x-h4r-signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      "x-h4r-nonce": expect.any(String),
    }));
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ mode: "prepare", source: "ferocity_business_automation" }));
  });

  it("does not retry a terminal authorization response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    const { runH4rAutonomousOperator } = await import("./operator");
    const result = await runH4rAutonomousOperator();
    expect(result).toEqual(expect.objectContaining({ ok: false, retryable: false }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
