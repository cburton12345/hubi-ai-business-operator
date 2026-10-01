export const expenseDocumentTypes = [
  "receipt", "invoice", "bill", "purchase_order", "warranty", "credit_memo", "statement", "other"
] as const;

export type ExpenseDocumentType = (typeof expenseDocumentTypes)[number];

export type MoneyFields = {
  subtotalCents: number | null;
  taxCents: number | null;
  discountCents: number | null;
  feeCents: number | null;
  tipCents: number | null;
  totalCents: number | null;
  currency: string;
};

export type DocumentLineItem = {
  description: string;
  productCode: string | null;
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  suggestedCategory: string | null;
  confidence: number;
};

export type StatementTransaction = {
  sourceKey: string;
  transactionDate: string | null;
  postedDate: string | null;
  description: string;
  merchantName: string | null;
  referenceNumber: string | null;
  amountCents: number;
  direction: "debit" | "credit";
  balanceCents: number | null;
  suggestedCategory: string | null;
  isTransfer: boolean;
  transferReason: string | null;
  confidence: number;
};

export type NormalizedExpenseDocument = MoneyFields & {
  documentType: ExpenseDocumentType;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  documentTime: string | null;
  paymentMethod: string | null;
  suggestedCategory: string | null;
  lineItems: DocumentLineItem[];
  statementTransactions: StatementTransaction[];
  extractedText: string;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
  reviewReasons: string[];
};

/** A consuming application supplies these. The shared engine never queries app-specific tables. */
export type AllocationTarget = {
  type: string;
  ref: string | null;
  label: string;
  aliases?: string[];
  context?: string | null;
  metadata?: Record<string, unknown>;
};

export type AllocationSuggestion = {
  targetType: string;
  targetRef: string | null;
  targetLabel: string;
  amountCents: number | null;
  allocationPercent: number | null;
  confidence: number;
  rationale: string;
  metadata?: Record<string, unknown>;
};

export type DuplicateCandidate = {
  id: string;
  contentSha256: string;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  totalCents: number | null;
};

export type DuplicateAssessment = {
  duplicateOfId: string | null;
  confidence: number;
  reasons: string[];
};

export type ProductExpenseAdapter = {
  productKey: string;
  listAllocationTargets(input: {
    workspaceId: string;
    document: NormalizedExpenseDocument;
  }): Promise<AllocationTarget[]>;
  postApprovedExpense?(input: {
    workspaceId: string;
    documentId: string;
    document: NormalizedExpenseDocument;
    allocations: AllocationSuggestion[];
  }): Promise<string | null>;
  postApprovedStatementTransactions?(input: {
    workspaceId: string;
    documentId: string;
    transactionIds: string[];
    allocations: AllocationSuggestion[];
    allocationByTransactionId?: Record<string, AllocationSuggestion>;
  }): Promise<string[] | null>;
};
