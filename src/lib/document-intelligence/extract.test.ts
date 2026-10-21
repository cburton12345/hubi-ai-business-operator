import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateJsonWithAiService: vi.fn(),
  generateVisionJsonWithAiService: vi.fn()
}));

vi.mock("@/lib/ai/ai-service", () => aiMocks);

import { extractExpenseDocument } from "./extract";

const extractedReceipt = {
  document_type: "receipt",
  vendor_name: "Test Store",
  currency: "USD",
  total_cents: 100,
  overall_confidence: 0.99,
  review_reasons: [],
  field_confidence: {},
  line_items: [],
  statement_transactions: []
};

describe("expense document extraction request limits", () => {
  beforeEach(() => {
    aiMocks.generateJsonWithAiService.mockReset().mockResolvedValue(extractedReceipt);
    aiMocks.generateVisionJsonWithAiService.mockReset().mockResolvedValue(extractedReceipt);
  });

  it("allows structured text extraction up to 60 seconds", async () => {
    await extractExpenseDocument({
      workspaceId: "workspace-test",
      fileName: "statement.csv",
      mimeType: "text/csv",
      suppliedText: "2026-10-01,Test Store,-1.00"
    });

    expect(aiMocks.generateJsonWithAiService).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 60_000 })
    );
  });

  it("allows image OCR extraction up to 60 seconds", async () => {
    await extractExpenseDocument({
      workspaceId: "workspace-test",
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      imageUrl: "data:image/jpeg;base64,dGVzdA=="
    });

    expect(aiMocks.generateVisionJsonWithAiService).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 60_000 })
    );
  });
});
