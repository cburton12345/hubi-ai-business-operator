import { describe, expect, it } from "vitest";
import { assessDuplicate } from "./deduplicate";
import { normalizeExpenseDocument } from "./normalize";

describe("document intelligence duplicate assessment", () => {
  const document = normalizeExpenseDocument({
    vendor_name: "Menards",
    document_number: "R-123",
    document_date: "2026-09-10",
    total_cents: 12999,
    overall_confidence: 0.95
  });

  it("recognizes an identical file", () => {
    const result = assessDuplicate(document, "same", [{
      id: "existing",
      contentSha256: "same",
      vendorName: null,
      documentNumber: null,
      documentDate: null,
      totalCents: null
    }]);
    expect(result).toEqual({ duplicateOfId: "existing", confidence: 1, reasons: ["The uploaded file is byte-for-byte identical."] });
  });

  it("warns when vendor, date, and total agree", () => {
    const result = assessDuplicate(document, "new", [{
      id: "existing",
      contentSha256: "old",
      vendorName: "Menards",
      documentNumber: null,
      documentDate: "2026-09-10",
      totalCents: 12999
    }]);
    expect(result.confidence).toBe(0.55);
  });
});
