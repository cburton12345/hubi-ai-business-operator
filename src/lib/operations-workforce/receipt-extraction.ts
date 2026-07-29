import { generateVisionJsonWithAiService } from "@/lib/ai/ai-service";

export type ReceiptExtractionResult = {
  vendor: string;
  totalCents: number;
  taxCents: number;
  category: string | null;
  city: string | null;
  state: string | null;
  expenseDate: string | null;
  reimbursementLikely: boolean;
  confidence: number;
  extractedText: string;
  fields: Record<string, unknown>;
};

function moneyToCents(value: string) {
  const number = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function maybeDate(text: string) {
  const match = text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2})\b/);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function inferCategory(text: string) {
  const lower = text.toLowerCase();
  if (/\b(gas|fuel|diesel|shell|kwik trip|speedway|bp|exxon)\b/.test(lower)) return "fuel";
  if (/\b(lumber|shingle|roof|paint|drywall|concrete|menards|home depot|lowe'?s)\b/.test(lower)) return "materials";
  if (/\b(tool|drill|saw|rental)\b/.test(lower)) return "tools";
  if (/\b(meal|restaurant|coffee|lunch|dinner)\b/.test(lower)) return "meals";
  return null;
}

function inferLocation(text: string) {
  const cityState = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*([A-Z]{2})\b/);
  return {
    city: cityState?.[1] ?? null,
    state: cityState?.[2] ?? null
  };
}

export function extractReceiptFields(input: { vendor?: string | null; text?: string | null; fileName?: string | null }): ReceiptExtractionResult {
  const text = input.text ?? "";
  const amounts = Array.from(text.matchAll(/\$?\b(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)\b/g))
    .map((match) => moneyToCents(match[1]))
    .filter((amount) => amount > 0);
  const total = amounts.length > 0 ? Math.max(...amounts) : 0;
  const taxMatch = text.match(/\b(?:tax|sales tax)\s*:?\s*\$?(\d{1,5}(?:\.\d{2})?)\b/i);
  const location = inferLocation(text);

  return {
    vendor: input.vendor?.trim() || "Unknown vendor",
    totalCents: total,
    taxCents: taxMatch ? moneyToCents(taxMatch[1]) : 0,
    category: inferCategory(`${input.vendor ?? ""} ${text}`),
    city: location.city,
    state: location.state,
    expenseDate: maybeDate(text),
    reimbursementLikely: /\b(reimburse|pay\s*back|employee paid|personal card|out of pocket)\b/i.test(text),
    confidence: total > 0 ? 0.62 : 0.25,
    extractedText: text,
    fields: {
      possibleTotals: amounts.slice(0, 8),
      possibleTaxCents: taxMatch ? moneyToCents(taxMatch[1]) : null,
      fileName: input.fileName ?? null,
      extractionMode: "local_text_first",
      reviewRequired: true
    }
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export async function extractReceiptFieldsWithVision(input: {
  tenantId?: string | null;
  brandId?: string | null;
  userId?: string | null;
  vendor?: string | null;
  text?: string | null;
  fileName?: string | null;
  imageUrl?: string | null;
  mimeType?: string | null;
}): Promise<ReceiptExtractionResult> {
  const fallback = extractReceiptFields(input);
  const imageUrl = input.imageUrl;

  if (!input.tenantId || !imageUrl || (input.mimeType && !input.mimeType.startsWith("image/"))) {
    return {
      ...fallback,
      fields: {
        ...fallback.fields,
        aiVisionUsed: false,
        aiVisionSkippedReason: !input.tenantId ? "Workspace unavailable" : !imageUrl ? "No image URL available" : "Receipt file is not an image"
      }
    };
  }

  try {
    const parsed = await generateVisionJsonWithAiService<Record<string, unknown>>({
      tenantId: input.tenantId,
      brandId: input.brandId,
      userId: input.userId,
      featureKey: "ai_generation",
      runType: "receipt_vision_extraction",
      aiCategory: "core",
      temperature: 0.1,
      system: "Extract receipt expense fields for bookkeeping review. Return only JSON. Do not guess if unreadable. Use cents for money.",
      userText:
        "Read this receipt image and return JSON with vendor, total_cents, tax_cents, category, city, state, expense_date as YYYY-MM-DD or null, reimbursement_likely, confidence from 0 to 1, and extracted_text. The owner will review before approval.",
      imageUrl,
      mimeType: input.mimeType,
      fallback: {
        vendor: fallback.vendor,
        total_cents: fallback.totalCents,
        tax_cents: fallback.taxCents,
        category: fallback.category,
        city: fallback.city,
        state: fallback.state,
        expense_date: fallback.expenseDate,
        reimbursement_likely: fallback.reimbursementLikely,
        confidence: fallback.confidence,
        extracted_text: fallback.extractedText
      },
      metadata: { fileName: input.fileName ?? null }
    });

    return {
      vendor: stringOrNull(parsed.vendor) ?? fallback.vendor,
      totalCents: numberOrZero(parsed.total_cents) || fallback.totalCents,
      taxCents: numberOrZero(parsed.tax_cents) || fallback.taxCents,
      category: stringOrNull(parsed.category) ?? fallback.category,
      city: stringOrNull(parsed.city) ?? fallback.city,
      state: stringOrNull(parsed.state) ?? fallback.state,
      expenseDate: stringOrNull(parsed.expense_date) ?? fallback.expenseDate,
      reimbursementLikely: typeof parsed.reimbursement_likely === "boolean" ? parsed.reimbursement_likely : fallback.reimbursementLikely,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? fallback.confidence))),
      extractedText: stringOrNull(parsed.extracted_text) ?? fallback.extractedText,
      fields: {
        ...fallback.fields,
        aiVisionUsed: true,
        imageFileName: input.fileName ?? null
      }
    };
  } catch (error) {
    return {
      ...fallback,
      fields: {
        ...fallback.fields,
        aiVisionUsed: false,
        aiVisionError: error instanceof Error ? error.message : "Receipt vision extraction failed"
      }
    };
  }
}
