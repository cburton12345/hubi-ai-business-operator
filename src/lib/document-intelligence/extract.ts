import { generateJsonWithAiService, generateVisionJsonWithAiService } from "@/lib/ai/ai-service";
import { normalizeExpenseDocument } from "./normalize";
import type { NormalizedExpenseDocument } from "./types";

const extractionSystem = `You are a precise business document extraction engine. Read receipts, invoices, bills, purchase orders, warranties, credit memos, and statements. Return JSON only. Never invent unreadable values. Money fields must be integer cents. Preserve useful OCR text. For every material field, give a confidence from 0 to 1.`;

const extractionRequest = `Return:
document_type; vendor_name; document_number; document_date (YYYY-MM-DD or null); document_time (HH:MM:SS or null); currency; subtotal_cents; tax_cents; discount_cents; fee_cents; tip_cents; total_cents; payment_method; suggested_category; extracted_text; overall_confidence; review_reasons; field_confidence; and line_items.
Each line item must include description, product_code, quantity, unit, unit_price_cents, discount_cents, tax_cents, total_cents, suggested_category, and confidence.
For a bank, credit-card, or payment-account statement, set document_type to statement and return statement_transactions containing EVERY visible transaction in page order. Each transaction must include transaction_date, posted_date, description, merchant_name, reference_number, amount_cents as a positive integer, direction as debit or credit, balance_cents, suggested_category, is_transfer, transfer_reason, and confidence. Credits/refunds/deposits are credit. Payments between the user's own accounts and credit-card payments are transfers, not expenses. Do not collapse statement transactions into one total or put them in line_items.
Use null for information that is absent or unreadable. Reconcile arithmetic when possible and put discrepancies in review_reasons.`;

const emptyExtraction: Record<string, unknown> = {
  document_type: "other",
  vendor_name: null,
  document_number: null,
  document_date: null,
  document_time: null,
  currency: "USD",
  subtotal_cents: null,
  tax_cents: null,
  discount_cents: null,
  fee_cents: null,
  tip_cents: null,
  total_cents: null,
  payment_method: null,
  suggested_category: null,
  extracted_text: "",
  overall_confidence: 0,
  review_reasons: ["Document extraction was unavailable."],
  field_confidence: {},
  line_items: [],
  statement_transactions: []
};

let configurePdfRenderer: Promise<void> | null = null;

async function getPdfTools() {
  const tools = await import("unpdf");
  configurePdfRenderer ??= tools.definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  await configurePdfRenderer;
  return tools;
}

function mergeExtractions(parts: Record<string, unknown>[], extraReviewReasons: string[] = []) {
  if (!parts.length) return { ...emptyExtraction, review_reasons: [...extraReviewReasons, "Document extraction was unavailable."] };
  const firstValue = (key: string) => parts.map((part) => part[key]).find((value) => value !== null && value !== undefined && value !== "") ?? null;
  const documentType = parts.some((part) => String(part.document_type).toLowerCase() === "statement")
    ? "statement"
    : firstValue("document_type") ?? "other";
  const confidences = parts.map((part) => Number(part.overall_confidence)).filter(Number.isFinite);
  const reviewReasons = parts.flatMap((part) => Array.isArray(part.review_reasons) ? part.review_reasons : [])
    .filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
  const hasUsefulResult = parts.some((part) =>
    (Array.isArray(part.statement_transactions) && part.statement_transactions.length > 0) ||
    (Array.isArray(part.line_items) && part.line_items.length > 0) ||
    Boolean(part.vendor_name || part.total_cents)
  );
  return {
    ...emptyExtraction,
    document_type: documentType,
    vendor_name: firstValue("vendor_name"),
    document_number: firstValue("document_number"),
    document_date: firstValue("document_date"),
    document_time: firstValue("document_time"),
    currency: firstValue("currency") ?? "USD",
    subtotal_cents: documentType === "statement" ? null : firstValue("subtotal_cents"),
    tax_cents: documentType === "statement" ? null : firstValue("tax_cents"),
    discount_cents: documentType === "statement" ? null : firstValue("discount_cents"),
    fee_cents: documentType === "statement" ? null : firstValue("fee_cents"),
    tip_cents: documentType === "statement" ? null : firstValue("tip_cents"),
    total_cents: documentType === "statement" ? null : firstValue("total_cents"),
    payment_method: firstValue("payment_method"),
    suggested_category: firstValue("suggested_category"),
    extracted_text: parts.map((part) => typeof part.extracted_text === "string" ? part.extracted_text : "").filter(Boolean).join("\n"),
    overall_confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
    review_reasons: [...new Set([
      ...reviewReasons.filter((reason) => hasUsefulResult || reason !== "Document extraction was unavailable."),
      ...extraReviewReasons
    ])],
    field_confidence: Object.assign({}, ...parts.map((part) => part.field_confidence && typeof part.field_confidence === "object" ? part.field_confidence : {})),
    line_items: parts.flatMap((part) => Array.isArray(part.line_items) ? part.line_items : []),
    statement_transactions: parts.flatMap((part) => Array.isArray(part.statement_transactions) ? part.statement_transactions : [])
  };
}

async function extractTextPart(input: {
  workspaceId: string;
  userId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  text: string;
  pageNumbers?: number[];
}) {
  return generateJsonWithAiService({
    tenantId: input.workspaceId,
    userId: input.userId,
    featureKey: "expense_document_intelligence",
    runType: "expense_document_text_extraction",
    aiCategory: "core",
    temperature: 0.05,
    system: extractionSystem,
    user: `${extractionRequest}\n\nFile name: ${input.fileName ?? "unknown"}.\n${input.pageNumbers?.length ? `PDF pages: ${input.pageNumbers.join(", ")}.\n` : ""}Imported/OCR text:\n${input.text}`,
    fallback: emptyExtraction,
    metadata: { fileName: input.fileName ?? null, mimeType: input.mimeType ?? null, pageNumbers: input.pageNumbers ?? null }
  });
}

async function extractImagePart(input: {
  workspaceId: string;
  userId?: string | null;
  fileName?: string | null;
  imageUrls: string[];
  pageNumbers?: number[];
}) {
  return generateVisionJsonWithAiService({
    tenantId: input.workspaceId,
    userId: input.userId,
    featureKey: "expense_document_intelligence",
    runType: input.pageNumbers ? "expense_scanned_pdf_page_extraction" : "expense_document_extraction",
    aiCategory: "core",
    temperature: 0.05,
    system: extractionSystem,
    userText: `${extractionRequest}\n\nFile name: ${input.fileName ?? "unknown"}.${input.pageNumbers?.length ? ` These are PDF pages ${input.pageNumbers.join(", ")} in order.` : ""}`,
    imageUrl: input.imageUrls[0],
    imageUrls: input.imageUrls,
    mimeType: "image/png",
    fallback: emptyExtraction,
    metadata: { fileName: input.fileName ?? null, pageNumbers: input.pageNumbers ?? null, renderedPageCount: input.imageUrls.length }
  });
}

export async function extractExpenseDocument(input: {
  workspaceId: string;
  userId?: string | null;
  imageUrl?: string | null;
  mimeType?: string | null;
  suppliedText?: string | null;
  fileName?: string | null;
  fileBytes?: Uint8Array | null;
}): Promise<NormalizedExpenseDocument> {
  let suppliedText = input.suppliedText?.trim() ?? "";
  let raw: Record<string, unknown>;

  if (input.imageUrl && input.mimeType?.startsWith("image/")) {
    raw = await extractImagePart({
      workspaceId: input.workspaceId,
      userId: input.userId,
      fileName: input.fileName,
      imageUrls: [input.imageUrl]
    });
  } else if (input.mimeType === "application/pdf" && input.fileBytes?.byteLength) {
    try {
      const { extractText, renderPageAsImage } = await getPdfTools();
      // pdf.js may transfer/detach the supplied buffer. Give text extraction and
      // every page render their own copy so mixed text/scanned PDFs stay reliable.
      const extracted = await extractText(Uint8Array.from(input.fileBytes), { mergePages: false });
      const pageLimit = Math.min(extracted.totalPages, 25);
      const pageRecords = extracted.text.slice(0, pageLimit).map((text, index) => ({
        pageNumber: index + 1,
        text: text.trim(),
        kind: text.trim().length >= 60 ? "text" as const : "image" as const
      }));
      const groups: { kind: "text" | "image"; pages: typeof pageRecords }[] = [];
      for (const page of pageRecords) {
        const previous = groups.at(-1);
        if (previous && previous.kind === page.kind && previous.pages.length < 5) previous.pages.push(page);
        else groups.push({ kind: page.kind, pages: [page] });
      }
      const parts: Record<string, unknown>[] = [];
      for (const group of groups) {
        const pageNumbers = group.pages.map((page) => page.pageNumber);
        if (group.kind === "text") {
          parts.push(await extractTextPart({
            workspaceId: input.workspaceId,
            userId: input.userId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            pageNumbers,
            text: group.pages.map((page) => `--- PAGE ${page.pageNumber} ---\n${page.text}`).join("\n\n").slice(0, 40_000)
          }));
        } else {
          const imageUrls: string[] = [];
          for (const page of group.pages) {
            imageUrls.push(await renderPageAsImage(Uint8Array.from(input.fileBytes), page.pageNumber, {
              canvasImport: () => import("@napi-rs/canvas"),
              scale: 1.6,
              toDataURL: true
            }));
          }
          parts.push(await extractImagePart({
            workspaceId: input.workspaceId,
            userId: input.userId,
            fileName: input.fileName,
            pageNumbers,
            imageUrls
          }));
        }
      }
      raw = mergeExtractions(parts, extracted.totalPages > 25
        ? [`This PDF has ${extracted.totalPages} pages; split it into files of 25 pages or fewer so every page can be reviewed.`]
        : []);
    } catch {
      raw = {
        ...emptyExtraction,
        document_type: "other",
        review_reasons: ["The PDF was stored safely, but page rendering/OCR failed and requires review."],
        overall_confidence: 0.1
      };
    }
  } else if (suppliedText) {
    raw = await extractTextPart({
      workspaceId: input.workspaceId,
      userId: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      text: suppliedText.slice(0, 120_000)
    });
  } else {
    raw = {
      ...emptyExtraction,
      document_type: input.mimeType === "application/pdf" ? "other" : "receipt",
      review_reasons: ["This document was stored safely but contains no readable text and requires visual review."],
      overall_confidence: 0.1
    };
  }

  return normalizeExpenseDocument(raw);
}
