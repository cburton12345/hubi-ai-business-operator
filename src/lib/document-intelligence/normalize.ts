import crypto from "node:crypto";
import { expenseDocumentTypes, type DocumentLineItem, type ExpenseDocumentType, type NormalizedExpenseDocument, type StatementTransaction } from "./types";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function decimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function confidence(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function isoDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function time(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

function documentType(value: unknown): ExpenseDocumentType {
  const normalized = String(value ?? "other").toLowerCase().replace(/[\s-]+/g, "_");
  return expenseDocumentTypes.includes(normalized as ExpenseDocumentType) ? normalized as ExpenseDocumentType : "other";
}

function lineItem(value: unknown): DocumentLineItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const description = text(row.description ?? row.name ?? row.item);
  if (!description) return null;
  return {
    description,
    productCode: text(row.product_code ?? row.sku),
    quantity: decimal(row.quantity),
    unit: text(row.unit),
    unitPriceCents: cents(row.unit_price_cents),
    discountCents: cents(row.discount_cents),
    taxCents: cents(row.tax_cents),
    totalCents: cents(row.total_cents),
    suggestedCategory: text(row.suggested_category ?? row.category),
    confidence: confidence(row.confidence, 0.5)
  };
}

function statementTransaction(value: unknown): StatementTransaction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const description = text(row.description ?? row.memo ?? row.name);
  const amount = cents(row.amount_cents ?? row.amount);
  if (!description || amount === null || amount === 0) return null;
  const rawDirection = String(row.direction ?? row.transaction_type ?? "").trim().toLowerCase();
  const normalizedDescription = description.toLowerCase();
  const explicitCredit = ["credit", "deposit", "refund", "reversal"].includes(rawDirection);
  const explicitDebit = ["debit", "charge", "purchase", "withdrawal", "fee"].includes(rawDirection);
  const creditLanguage = /\b(refund|reversal|deposit|cashback|cash back|interest paid|credit received)\b/i.test(normalizedDescription);
  const paymentReceivedLanguage = /\bpayment received\b/i.test(normalizedDescription);
  const accountPaymentLanguage = /\b(payment thank you|autopay payment|online payment|card payment)\b/i.test(normalizedDescription);
  const paymentLanguage = paymentReceivedLanguage || accountPaymentLanguage;
  const counterpartyName = text(row.counterparty_name ?? row.display_name ?? row.recipient_name ?? row.sender_name);
  const counterpartyHandle = text(row.counterparty_handle ?? row.cashtag ?? row.handle);
  const namedIncomingPayment = paymentReceivedLanguage && Boolean(counterpartyName || counterpartyHandle);
  const providerMarkedTransfer = row.is_transfer === true || String(row.is_transfer).toLowerCase() === "true";
  // Bank exports disagree about whether debits are positive or negative. An
  // explicit semantic direction therefore wins over the numeric sign. When a
  // provider omits direction, use narrow language signals and otherwise keep
  // the row as a debit for mandatory human statement review.
  const direction: "debit" | "credit" = explicitCredit || (!explicitDebit && (creditLanguage || paymentLanguage))
    ? "credit"
    : "debit";
  const transactionDate = isoDate(row.transaction_date ?? row.date);
  const postedDate = isoDate(row.posted_date);
  const referenceNumber = text(row.reference_number ?? row.reference ?? row.transaction_id);
  const sourceKey = crypto.createHash("sha256").update([
    transactionDate ?? "", postedDate ?? "", description.toLowerCase(), Math.abs(amount), direction, referenceNumber ?? ""
  ].join("|")).digest("hex");
  return {
    sourceKey,
    transactionDate,
    postedDate,
    description,
    merchantName: text(row.merchant_name ?? row.vendor_name ?? row.merchant),
    counterpartyName,
    counterpartyHandle,
    note: text(row.note ?? row.memo),
    transactionType: text(row.transaction_type ?? row.type),
    providerStatus: text(row.provider_status ?? row.status),
    referenceNumber,
    amountCents: Math.abs(amount),
    feeCents: Math.max(0, cents(row.fee_cents) ?? 0),
    direction,
    balanceCents: cents(row.balance_cents ?? row.balance),
    suggestedCategory: text(row.suggested_category ?? row.category),
    // Cash App and similar providers often label tenant/customer money as
    // "Payment received". A named incoming payer is evidence of a deposit,
    // not evidence of an own-account transfer, even if the model guessed true.
    isTransfer: namedIncomingPayment ? false : providerMarkedTransfer || accountPaymentLanguage,
    transferReason: namedIncomingPayment ? null : text(row.transfer_reason) ?? (accountPaymentLanguage ? "Likely account or card payment" : null),
    confidence: confidence(row.confidence, 0.5)
  };
}

export function normalizeExpenseDocument(raw: Record<string, unknown>): NormalizedExpenseDocument {
  const fieldConfidenceRaw = raw.field_confidence && typeof raw.field_confidence === "object"
    ? raw.field_confidence as Record<string, unknown>
    : {};
  const fieldConfidence = Object.fromEntries(
    Object.entries(fieldConfidenceRaw).map(([key, value]) => [key, confidence(value)])
  );
  const subtotalCents = cents(raw.subtotal_cents);
  const taxCents = cents(raw.tax_cents);
  const discountCents = cents(raw.discount_cents);
  const feeCents = cents(raw.fee_cents);
  const tipCents = cents(raw.tip_cents);
  const totalCents = cents(raw.total_cents);
  const vendorName = text(raw.vendor_name ?? raw.vendor ?? raw.merchant);
  const documentDate = isoDate(raw.document_date ?? raw.date);
  const lineItems = Array.isArray(raw.line_items) ? raw.line_items.map(lineItem).filter((item): item is DocumentLineItem => Boolean(item)) : [];
  const normalizedStatementTransactions = Array.isArray(raw.statement_transactions)
    ? raw.statement_transactions.slice(0, 500).map(statementTransaction).filter((item): item is StatementTransaction => Boolean(item))
    : [];
  const transactionOccurrences = new Map<string, number>();
  const statementTransactions = normalizedStatementTransactions.map((transaction) => {
    const occurrence = (transactionOccurrences.get(transaction.sourceKey) ?? 0) + 1;
    transactionOccurrences.set(transaction.sourceKey, occurrence);
    return {
      ...transaction,
      // Keeps genuinely repeated same-day/same-amount charges distinct while
      // remaining stable when the same statement is imported again.
      sourceKey: crypto.createHash("sha256").update(`${transaction.sourceKey}|occurrence:${occurrence}`).digest("hex")
    };
  });
  const reviewReasons = Array.isArray(raw.review_reasons)
    ? raw.review_reasons.map(text).filter((item): item is string => Boolean(item))
    : [];
  const overallConfidence = confidence(raw.overall_confidence ?? raw.confidence, 0.25);
  const coverageRaw = raw.source_coverage && typeof raw.source_coverage === "object"
    ? raw.source_coverage as Record<string, unknown>
    : null;
  const pageNumbers = (value: unknown) => Array.isArray(value)
    ? value.map(Number).filter((page) => Number.isInteger(page) && page > 0)
    : [];
  const sourceCoverage = coverageRaw ? {
    totalPages: Math.max(0, Number(coverageRaw.totalPages) || 0),
    attemptedPages: pageNumbers(coverageRaw.attemptedPages),
    readablePages: pageNumbers(coverageRaw.readablePages),
    failedPages: pageNumbers(coverageRaw.failedPages),
    omittedPages: pageNumbers(coverageRaw.omittedPages),
  } : undefined;

  const normalizedDocumentType = documentType(raw.document_type);
  if (!vendorName) reviewReasons.push(normalizedDocumentType === "statement" ? "Financial institution could not be read confidently." : "Vendor could not be read confidently.");
  if (totalCents === null && normalizedDocumentType !== "statement") reviewReasons.push("Total could not be read confidently.");
  if (!documentDate) reviewReasons.push("Document date needs confirmation.");
  if (normalizedDocumentType === "statement" && statementTransactions.length === 0) reviewReasons.push("No statement transactions could be extracted.");
  if (Array.isArray(raw.statement_transactions) && raw.statement_transactions.length > 500) reviewReasons.push("This statement exceeds the 500-transaction review limit and must be split.");
  if (overallConfidence < 0.8) reviewReasons.push("Extraction confidence is below the automatic-processing threshold.");

  return {
    documentType: normalizedDocumentType,
    vendorName,
    merchantAddress: text(raw.merchant_address ?? raw.vendor_address),
    merchantCity: text(raw.merchant_city ?? raw.vendor_city),
    merchantState: text(raw.merchant_state ?? raw.vendor_state)?.toUpperCase() ?? null,
    merchantPostalCode: text(raw.merchant_postal_code ?? raw.vendor_postal_code ?? raw.merchant_zip),
    documentNumber: text(raw.document_number ?? raw.invoice_number ?? raw.receipt_number ?? raw.order_number),
    documentDate,
    documentTime: time(raw.document_time ?? raw.time),
    subtotalCents,
    taxCents,
    discountCents,
    feeCents,
    tipCents,
    totalCents,
    currency: (text(raw.currency) ?? "USD").toUpperCase().slice(0, 3),
    paymentMethod: text(raw.payment_method),
    suggestedCategory: text(raw.suggested_category ?? raw.category),
    lineItems,
    statementTransactions,
    extractedText: text(raw.extracted_text) ?? "",
    fieldConfidence,
    overallConfidence,
    reviewReasons: [...new Set(reviewReasons)],
    sourceCoverage,
  };
}
