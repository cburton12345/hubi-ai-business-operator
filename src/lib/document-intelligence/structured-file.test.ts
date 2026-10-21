import { describe, expect, it } from "vitest";
import { extractStructuredFileText, structuredExtension } from "./structured-file";

describe("structured financial files", () => {
  it("accepts supported financial downloads without treating arbitrary extensions as documents", () => {
    expect(structuredExtension("cash-app.csv")).toBe("csv");
    expect(structuredExtension("bank.QFX")).toBe("qfx");
    expect(structuredExtension("macro.xlsm")).toBeNull();
  });

  it("decodes UTF-8 delimited and XML-style exports for structured extraction", async () => {
    const bytes = new TextEncoder().encode("date,amount,note\n2026-09-01,1250,Rent");
    await expect(extractStructuredFileText({ fileName: "cash-app.csv", bytes })).resolves.toContain("2026-09-01,1250,Rent");
  });
});
