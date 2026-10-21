import { describe, expect, it } from "vitest";
import { receiptUploadMimeType } from "./receipt-upload";

describe("receipt upload MIME handling", () => {
  it("uses canonical MIME types for structured financial files", () => {
    expect(receiptUploadMimeType({ name: "cash-app.CSV", type: "application/vnd.ms-excel" })).toBe("text/csv");
    expect(receiptUploadMimeType({ name: "statement.qfx", type: "" })).toBe("application/vnd.intu.qfx");
    expect(receiptUploadMimeType({ name: "purchases.xlsx", type: "application/octet-stream" })).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("preserves accepted image and PDF MIME types", () => {
    expect(receiptUploadMimeType({ name: "receipt.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(receiptUploadMimeType({ name: "statement.pdf", type: "application/pdf" })).toBe("application/pdf");
  });
});
