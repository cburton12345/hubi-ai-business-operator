import { afterEach, describe, expect, it } from "vitest";
import { isByoAiEligibleRunType, managedAiConfiguration } from "./byo-ai";

const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;

afterEach(() => {
  if (originalOpenAiBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
});

describe("BYO AI boundaries", () => {
  it("allows commodity drafting and extraction workloads", () => {
    expect(isByoAiEligibleRunType("weekly_marketing_plan")).toBe(true);
    expect(isByoAiEligibleRunType("receipt_vision_extraction")).toBe(true);
  });

  it("keeps proprietary orchestration and public agents on Ferocity-managed AI", () => {
    expect(isByoAiEligibleRunType("owner_command_event_triage")).toBe(false);
    expect(isByoAiEligibleRunType("public_website_chat_reply")).toBe(false);
  });

  it("routes managed AI through the Netlify AI Gateway when it is available", () => {
    process.env.OPENAI_BASE_URL = "https://ferocity.live/.netlify/ai/";

    expect(managedAiConfiguration("json").baseUrl).toBe(
      "https://ferocity.live/.netlify/ai/v1"
    );
  });

  it("keeps direct OpenAI as the local fallback", () => {
    delete process.env.OPENAI_BASE_URL;

    expect(managedAiConfiguration("json").baseUrl).toBe("https://api.openai.com/v1");
  });
});
