import { describe, expect, it } from "vitest";
import { externalOutputPolicyLimits, sanitizeExternalText, sanitizeExternalToolOutput } from "@/lib/mcp/output-policy";

describe("external AI output policy", () => {
  it("removes credentials, private prompts, source internals, and nested secrets", () => {
    const result = sanitizeExternalToolOutput({
      customer: { id: "customer-1", name: "Example", accessToken: "do-not-send", nested: { system_prompt: "private" } },
      sourceCode: "private implementation",
      database_url: "postgresql://user:secret@example.test/db",
      safe: "visible",
    });
    expect(result).toMatchObject({
      customer: { id: "customer-1", name: "Example", nested: {} },
      safe: "visible",
      _ferocityOutputPolicy: { redacted: true, truncated: false },
    });
  });

  it("redacts secret-shaped values even when a harmless key was used", () => {
    expect(sanitizeExternalText(`Connect with Bearer ${"a".repeat(40)}`)).toBe("Connect with [REDACTED]");
    expect(sanitizeExternalText(`fer_mcp_${"a".repeat(43)}`)).toBe("[REDACTED]");
    expect(sanitizeExternalText("postgresql://owner:password@example.test/ferocity")).toBe("[REDACTED]");
  });

  it("caps enumeration, text size, and recursive depth", () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: index }));
    const result = sanitizeExternalToolOutput({ items, note: "x".repeat(7_000) });
    expect(result.items).toHaveLength(externalOutputPolicyLimits.maxArrayItems);
    expect(String(result.note)).toContain("[TRUNCATED]");
    expect(result._ferocityOutputPolicy).toMatchObject({
      redacted: false,
      truncated: true,
      truncatedPaths: expect.arrayContaining(["data.items", "data.note"]),
    });
  });
});
