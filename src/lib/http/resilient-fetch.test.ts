import { afterEach, describe, expect, it, vi } from "vitest";
import { resilientFetch } from "./resilient-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resilientFetch", () => {
  it("retries safe reads after a transient provider failure", async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", provider);

    const response = await resilientFetch("https://provider.example/status", undefined, {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 1_000
    });

    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("does not retry unsafe writes unless the caller explicitly marks them safe", async () => {
    const provider = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", provider);

    const response = await resilientFetch("https://provider.example/send", { method: "POST" }, {
      retries: 2,
      retryDelayMs: 1,
      timeoutMs: 1_000
    });

    expect(response.status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("aborts provider calls that exceed the deadline", async () => {
    const provider = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", provider);

    await expect(
      resilientFetch("https://provider.example/slow", undefined, { timeoutMs: 1_000 })
    ).rejects.toThrow(/timed out/i);
  });
});
