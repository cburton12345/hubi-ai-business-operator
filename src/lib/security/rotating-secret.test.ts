import { describe, expect, it } from "vitest";
import { hasRotatingSecret, rotatingSecretCandidates, timingSafeSecretMatch } from "@/lib/security/rotating-secret";

describe("rotating secret support", () => {
  it("accepts the current or previous secret without accepting blanks", () => {
    expect(timingSafeSecretMatch("current-value", "current-value", "previous-value")).toBe(true);
    expect(timingSafeSecretMatch("previous-value", "current-value", "previous-value")).toBe(true);
    expect(timingSafeSecretMatch("wrong-value", "current-value", "previous-value")).toBe(false);
    expect(timingSafeSecretMatch("", "current-value", "previous-value")).toBe(false);
  });

  it("normalizes and de-duplicates configured values", () => {
    expect(rotatingSecretCandidates(" current-value ", "current-value", "", undefined)).toEqual(["current-value"]);
    expect(hasRotatingSecret(undefined, " previous-value ")).toBe(true);
    expect(hasRotatingSecret(undefined, " ")).toBe(false);
  });
});
