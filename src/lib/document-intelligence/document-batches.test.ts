import { describe, expect, it, vi } from "vitest";
import { summarizeDocumentImportBatchCounts } from "./document-batches";

vi.mock("server-only", () => ({}));

describe("document import batch accounting", () => {
  it("keeps a batch processing while any selected file has no outcome", () => {
    expect(summarizeDocumentImportBatchCounts({ expected: 12, imported: 10, reused: 1, failed: 0 }))
      .toEqual({ expected: 12, imported: 10, reused: 1, failed: 0, unresolved: 1, status: "processing" });
  });

  it("distinguishes reused evidence from new imports without treating either as failure", () => {
    expect(summarizeDocumentImportBatchCounts({ expected: 12, imported: 1, reused: 11, failed: 0 }).status)
      .toBe("completed");
  });

  it("marks mixed and all-failed batches truthfully", () => {
    expect(summarizeDocumentImportBatchCounts({ expected: 3, imported: 2, reused: 0, failed: 1 }).status)
      .toBe("partial");
    expect(summarizeDocumentImportBatchCounts({ expected: 3, imported: 0, reused: 0, failed: 3 }).status)
      .toBe("failed");
  });
});
