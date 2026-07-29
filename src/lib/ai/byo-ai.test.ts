import { describe, expect, it } from "vitest";
import { isByoAiEligibleRunType } from "./byo-ai";

describe("BYO AI boundaries", () => {
  it("allows commodity drafting and extraction workloads", () => {
    expect(isByoAiEligibleRunType("weekly_marketing_plan")).toBe(true);
    expect(isByoAiEligibleRunType("receipt_vision_extraction")).toBe(true);
  });

  it("keeps proprietary orchestration and public agents on Ferocity-managed AI", () => {
    expect(isByoAiEligibleRunType("owner_command_event_triage")).toBe(false);
    expect(isByoAiEligibleRunType("public_website_chat_reply")).toBe(false);
  });
});
