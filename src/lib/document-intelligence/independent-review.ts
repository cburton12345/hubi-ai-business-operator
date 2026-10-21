import type { NormalizedExpenseDocument, StatementTransaction } from "./types";

export type DocumentIndependentReview = {
  tier: "important" | "critical";
  status: "passed" | "disagreed" | "reviewer_unavailable";
  deterministicIssues: string[];
  disagreements: string[];
  humanReviewRequired: boolean;
};

function normalizedText(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function transactionSignature(row: StatementTransaction) {
  return [row.transactionDate ?? "", row.amountCents, row.direction, normalizedText(row.description)].join("|");
}

export function hasUsableDocumentExtraction(document: NormalizedExpenseDocument) {
  if (document.sourceCoverage && (
    document.sourceCoverage.totalPages < 1
    || document.sourceCoverage.attemptedPages.length !== document.sourceCoverage.totalPages
    || document.sourceCoverage.readablePages.length !== document.sourceCoverage.totalPages
    || document.sourceCoverage.failedPages.length > 0
    || document.sourceCoverage.omittedPages.length > 0
  )) return false;
  if (document.documentType === "statement") return document.statementTransactions.length > 0;
  return Boolean(
    document.vendorName
    || document.documentDate
    || document.totalCents !== null
    || document.subtotalCents !== null
    || document.lineItems.length
    || document.extractedText.trim().length >= 20,
  );
}

export function deterministicDocumentIssues(document: NormalizedExpenseDocument) {
  const issues: string[] = [];
  if (!hasUsableDocumentExtraction(document)) issues.push("No usable document details were extracted.");
  if (document.sourceCoverage?.failedPages.length) {
    issues.push(`PDF extraction failed on page(s) ${document.sourceCoverage.failedPages.join(", ")}.`);
  }
  if (document.sourceCoverage?.omittedPages.length) {
    issues.push(`PDF extraction omitted page(s) ${document.sourceCoverage.omittedPages.join(", ")}.`);
  }
  if (document.documentType !== "statement" && document.totalCents !== null && document.subtotalCents !== null) {
    const expected = document.subtotalCents
      + (document.taxCents ?? 0)
      + (document.feeCents ?? 0)
      + (document.tipCents ?? 0)
      - (document.discountCents ?? 0);
    if (expected !== document.totalCents) issues.push(`Document arithmetic differs by ${document.totalCents - expected} cents.`);
  }
  if (document.documentType === "statement") {
    if (!document.statementTransactions.length) issues.push("No statement transactions were extracted.");
    if (document.statementTransactions.some((row) => row.amountCents <= 0)) issues.push("One or more statement amounts are not positive integers.");
    if (document.statementTransactions.some((row) => !row.transactionDate)) issues.push("One or more statement transactions have no date.");
    const signatures = document.statementTransactions.map(transactionSignature);
    if (new Set(signatures).size !== signatures.length) issues.push("The extraction contains repeated transaction rows that need confirmation.");
  }
  return issues;
}

export function compareDocumentExtractions(
  primary: NormalizedExpenseDocument,
  reviewer: NormalizedExpenseDocument | null,
): DocumentIndependentReview {
  const tier = primary.documentType === "statement" ? "critical" : "important";
  const deterministicIssues = deterministicDocumentIssues(primary);
  if (!reviewer) {
    return { tier, status: "reviewer_unavailable", deterministicIssues, disagreements: [], humanReviewRequired: true };
  }
  const reviewerIssues = deterministicDocumentIssues(reviewer).map((issue) => `Independent review: ${issue}`);
  const disagreements: string[] = [];
  const compare = (label: string, left: unknown, right: unknown) => {
    if ((left ?? null) !== (right ?? null)) disagreements.push(`${label} differs between the primary and independent review.`);
  };
  compare("Document type", primary.documentType, reviewer.documentType);
  compare("Document date", primary.documentDate, reviewer.documentDate);
  compare("Subtotal", primary.subtotalCents, reviewer.subtotalCents);
  compare("Tax", primary.taxCents, reviewer.taxCents);
  compare("Total", primary.totalCents, reviewer.totalCents);
  if (normalizedText(primary.vendorName) !== normalizedText(reviewer.vendorName)) disagreements.push("Vendor differs between the primary and independent review.");
  if (primary.documentType === "statement") {
    compare("Transaction count", primary.statementTransactions.length, reviewer.statementTransactions.length);
    const primaryRows = primary.statementTransactions.map(transactionSignature);
    const reviewerRows = reviewer.statementTransactions.map(transactionSignature);
    primaryRows.forEach((signature, index) => {
      if (signature !== reviewerRows[index]) disagreements.push(`Statement transaction ${index + 1} differs between reviews.`);
    });
  }
  const allDeterministicIssues = [...deterministicIssues, ...reviewerIssues];
  const status = allDeterministicIssues.length || disagreements.length ? "disagreed" : "passed";
  return { tier, status, deterministicIssues: allDeterministicIssues, disagreements, humanReviewRequired: tier === "critical" || status !== "passed" };
}

export function needsIndependentDocumentReview(document: NormalizedExpenseDocument) {
  return document.documentType === "statement"
    || document.overallConfidence < 0.92
    || deterministicDocumentIssues(document).length > 0
    || (document.totalCents ?? 0) >= 1_000_000;
}
