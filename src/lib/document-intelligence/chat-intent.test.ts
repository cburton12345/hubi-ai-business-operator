import { describe, expect, it } from "vitest";
import {
  continuesDocumentIntelligenceConversation,
  hasDocumentIntelligenceIntent,
  isShortAffirmation,
  requestsDocumentUpload,
  requestedFinancialReportYear,
  requestsExistingFinancialReport,
} from "./chat-intent";

describe("Ask Ferocity document conversation intent", () => {
  it("recognizes receipt, OCR, tax, and Cash App statement work", () => {
    expect(hasDocumentIntelligenceIntent("Upload Cash App statements for OCR and a tax breakdown")).toBe(true);
    expect(hasDocumentIntelligenceIntent("I need to classify receipts and deposits")).toBe(true);
    expect(hasDocumentIntelligenceIntent("How many financial documents need review?")).toBe(true);
    expect(hasDocumentIntelligenceIntent("Show me stale leads")).toBe(false);
  });

  it("uses a short confirmation only when recent context establishes the document task", () => {
    expect(isShortAffirmation("Yes")).toBe(true);
    expect(continuesDocumentIntelligenceConversation({
      command: "Yes",
      conversationContext: "Owner: Upload my Cash App statements for OCR and breakdown.",
    })).toBe(true);
    expect(continuesDocumentIntelligenceConversation({
      command: "Yes",
      conversationContext: "Owner: Show me stale leads.",
    })).toBe(false);
  });

  it("always keeps attached documents in the document-intelligence path", () => {
    expect(continuesDocumentIntelligenceConversation({
      command: "Please handle these",
      conversationContext: "",
      hasDocuments: true,
    })).toBe(true);
  });

  it("distinguishes a feature question from a request that needs a file", () => {
    expect(requestsDocumentUpload("Upload Cash App statements for a breakdown")).toBe(true);
    expect(requestsDocumentUpload("Yes")).toBe(true);
    expect(requestsDocumentUpload("We should have OCR for receipts and taxes")).toBe(false);
  });

  it("routes questions about existing financial records through business evidence", () => {
    expect(continuesDocumentIntelligenceConversation({
      command: "What needs attention in my financial documents, deposits, and expenses?",
      conversationContext: "",
      hasDocuments: false,
    })).toBe(false);
    expect(continuesDocumentIntelligenceConversation({
      command: "Do we have OCR for receipts and tax documents?",
      conversationContext: "",
      hasDocuments: false,
    })).toBe(true);
  });

  it("routes totals and printable reports to existing financial evidence", () => {
    expect(requestsExistingFinancialReport({ command: "I need you to add everything up. I need the expenses added up" })).toBe(true);
    expect(requestsExistingFinancialReport({ command: "prepare a printable expense summary report" })).toBe(true);
    expect(requestsExistingFinancialReport({
      command: "whats taking so long",
      conversationContext: "Owner: prepare a printable expense summary report",
    })).toBe(true);
    expect(requestsExistingFinancialReport({ command: "Upload these expense receipts" })).toBe(false);
  });

  it("uses the most recent explicit report year", () => {
    expect(requestedFinancialReportYear({
      command: "Print 2025",
      conversationContext: "We previously discussed 2024 expenses.",
    })).toBe(2025);
    expect(requestedFinancialReportYear({ command: "Print the expense report" })).toBeNull();
  });
});
