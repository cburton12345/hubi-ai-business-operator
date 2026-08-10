import { describe, expect, it } from "vitest";

import { ensureJsonInstruction } from "@/lib/ai/json-response";

describe("ensureJsonInstruction", () => {
  it("preserves prompts that already request JSON", () => {
    expect(ensureJsonInstruction("Return strict JSON only.")).toBe("Return strict JSON only.");
  });

  it("adds the instruction required by OpenAI JSON mode", () => {
    expect(ensureJsonInstruction("Return the same manifest shape."))
      .toBe("Return the same manifest shape. Return JSON only.");
  });
});
