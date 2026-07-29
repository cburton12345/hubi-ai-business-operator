import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  env: {
    VIDEO_PROVIDER: "openai",
    VIDEO_API_KEY: "video-key",
    VIDEO_MODEL: "sora-2",
    VIDEO_RENDERING_ENABLED: "true",
    VIDEO_MONTHLY_BUDGET_CENTS: "10000",
    VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS: "3000",
    VIDEO_PROVIDER_COST_CENTS_PER_SECOND: "10",
    VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND: "18"
  } as Record<string, string | undefined>
}));

vi.mock("@/lib/env", () => ({ env: mocked.env }));

import {
  getManagedVideoConfiguration,
  OpenAiVideoAdapter
} from "@/lib/providers/video-adapters";

const context = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  correlationId: "video-test",
  idempotencyKey: "video-test-1",
  liveActionsEnabled: true
};

describe("OpenAI video adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocked.env.VIDEO_RENDERING_ENABLED = "true";
    mocked.env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND = "18";
  });

  it("requires profitable pricing and explicit activation", () => {
    expect(getManagedVideoConfiguration()?.providerKey).toBe("openai_video");
    mocked.env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND = "10";
    expect(getManagedVideoConfiguration()).toBeNull();
    mocked.env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND = "18";
    mocked.env.VIDEO_RENDERING_ENABLED = "false";
    expect(getManagedVideoConfiguration()).toBeNull();
  });

  it("submits only supported durations and records estimated provider cost", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        id: "video_123",
        status: "queued",
        model: "sora-2",
        seconds: "12",
        size: "1280x720"
      }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const result = await new OpenAiVideoAdapter().createVideo(context, {
      prompt: "A truthful local-service advertisement.",
      durationSeconds: 30,
      aspectRatio: "16:9"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.jobId).toBe("video_123");
    expect(result.data.usage.quantity).toBe(12);
    expect(result.data.usage.providerCostCents).toBe(120);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("https://api.openai.com/v1/videos");
    expect((request[1]?.body as FormData).get("seconds")).toBe("12");
    expect((request[1]?.body as FormData).get("size")).toBe("1280x720");
  });

  it("retrieves asynchronous render status without exposing a provider content URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "video_123", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const result = await new OpenAiVideoAdapter().getVideo(context, "video_123");
    expect(result).toEqual({ ok: true, data: { status: "completed" } });
  });
});
