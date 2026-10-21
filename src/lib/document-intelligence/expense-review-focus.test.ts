import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("expense review focus", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/expenses/page.tsx"), "utf8");

  it("renders full transaction controls for only the explicitly selected document", () => {
    expect(source).toContain("const expanded = documentId === document.id");
    expect(source).toContain("needsReview && expanded");
    expect(source).toContain("needsReview && !expanded");
    expect(source).toContain('className="document-review-summary"');
    expect(source).toContain("source and review check");
  });

  it("provides a focused review route and a way back to the document list", () => {
    expect(source).toContain('query.set("document", selectedDocumentId)');
    expect(source).toContain("Open transaction details");
    expect(source).toContain("Close review");
  });
});
