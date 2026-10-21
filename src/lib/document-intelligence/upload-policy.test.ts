import { describe, expect, it } from "vitest";
import {
  MAX_EXPENSE_BATCH_BYTES,
  MAX_EXPENSE_DOCUMENT_BYTES,
  MAX_EXPENSE_DOCUMENT_FILES,
  validateExpenseDocumentSelection
} from "./upload-policy";

function file(name: string, size: number) {
  return { name, size } as File;
}

describe("expense document upload policy", () => {
  it("accepts mixed files within the per-file and aggregate limits", () => {
    expect(validateExpenseDocumentSelection([
      file("cash-app.csv", 2 * 1024 * 1024),
      file("receipts.pdf", 10 * 1024 * 1024)
    ])).toBeNull();
  });

  it("rejects an oversized file before submission", () => {
    expect(validateExpenseDocumentSelection([
      file("statement.pdf", MAX_EXPENSE_DOCUMENT_BYTES + 1)
    ])).toContain("larger than 15 MB");
  });

  it("accepts the maximum direct-to-storage batch without routing bytes through an action", () => {
    const files = Array.from(
      { length: MAX_EXPENSE_DOCUMENT_FILES },
      (_, index) => file(`${index}.pdf`, MAX_EXPENSE_DOCUMENT_BYTES)
    );
    expect(files.reduce((sum, item) => sum + item.size, 0)).toBe(MAX_EXPENSE_BATCH_BYTES);
    expect(validateExpenseDocumentSelection(files)).toBeNull();
  });

  it("rejects more than the supported file count", () => {
    expect(validateExpenseDocumentSelection(
      Array.from({ length: MAX_EXPENSE_DOCUMENT_FILES + 1 }, (_, index) => file(`${index}.txt`, 1))
    )).toContain(`up to ${MAX_EXPENSE_DOCUMENT_FILES} files`);
  });
});
