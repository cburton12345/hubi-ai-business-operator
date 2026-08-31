import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken, maskPhoneNumber } from "./crypto";

describe("Ferocity Connect credential utilities", () => {
  it("generates high-entropy opaque tokens and stores only deterministic hashes", () => {
    const left = createOpaqueToken("fcd");
    const right = createOpaqueToken("fcd");
    expect(left).toMatch(/^fcd_[A-Za-z0-9_-]{40,}$/);
    expect(left).not.toBe(right);
    expect(hashOpaqueToken(left)).toHaveLength(64);
    expect(hashOpaqueToken(left)).toBe(hashOpaqueToken(left));
  });

  it("never exposes a complete SIM phone number", () => {
    expect(maskPhoneNumber("+1 (715) 555-0199")).toBe("••••0199");
    expect(maskPhoneNumber(null)).toBeNull();
  });
});
