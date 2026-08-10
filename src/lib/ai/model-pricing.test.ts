import { afterEach, describe, expect, it } from "vitest";
import { estimateTextCostCents } from "./model-pricing";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("model-aware AI pricing", () => {
  it("prices models independently instead of applying one global rate", () => {
    delete process.env.AI_INPUT_USD_PER_MILLION;
    delete process.env.AI_OUTPUT_USD_PER_MILLION;
    expect(estimateTextCostCents("gpt-5-nano", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBe(45);
    expect(estimateTextCostCents("gpt-5.6-luna", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBe(700);
  });

  it("applies the lower cached-input rate only to cached tokens", () => {
    expect(estimateTextCostCents("gpt-5.6-luna", {
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 500_000 }
    })).toBe(55);
  });

  it("keeps explicit emergency pricing overrides", () => {
    process.env.AI_INPUT_USD_PER_MILLION = "2";
    process.env.AI_OUTPUT_USD_PER_MILLION = "4";
    expect(estimateTextCostCents("unknown-model", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBe(600);
  });
});
