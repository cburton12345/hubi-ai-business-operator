import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateJsonWithAiService } = vi.hoisted(() => ({
  generateJsonWithAiService: vi.fn()
}));

vi.mock("@/lib/ai/ai-service", () => ({
  generateJsonWithAiService,
  recordAiGenerationRun: vi.fn()
}));

import { generateJsonWithProvider } from "./model-provider";

describe("AI provider recovery routing", () => {
  beforeEach(() => generateJsonWithAiService.mockReset());

  it("uses the managed recovery model when the primary returns its fallback", async () => {
    const fallback = { reply: "temporarily unavailable" };
    const recovered = { reply: "real AI answer" };
    generateJsonWithAiService.mockResolvedValueOnce(fallback).mockResolvedValueOnce(recovered);

    await expect(generateJsonWithProvider({
      tenantId: "11111111-1111-4111-8111-111111111111",
      runType: "public_website_chat_reply",
      recoveryRunType: "public_website_chat_reply_recovery",
      system: "Return JSON.",
      user: "Help my business.",
      fallback
    })).resolves.toBe(recovered);

    expect(generateJsonWithAiService).toHaveBeenNthCalledWith(1, expect.objectContaining({
      runType: "public_website_chat_reply"
    }));
    expect(generateJsonWithAiService).toHaveBeenNthCalledWith(2, expect.objectContaining({
      runType: "public_website_chat_reply_recovery"
    }));
  });

  it("does not make a second call after a successful primary response", async () => {
    const fallback = { reply: "temporarily unavailable" };
    const answer = { reply: "real AI answer" };
    generateJsonWithAiService.mockResolvedValueOnce(answer);

    await expect(generateJsonWithProvider({
      tenantId: "11111111-1111-4111-8111-111111111111",
      runType: "public_website_chat_reply",
      recoveryRunType: "public_website_chat_reply_recovery",
      system: "Return JSON.",
      user: "Help my business.",
      fallback
    })).resolves.toBe(answer);

    expect(generateJsonWithAiService).toHaveBeenCalledTimes(1);
  });
});
