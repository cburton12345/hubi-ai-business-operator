import { generateVisionJsonWithAiService } from "@/lib/ai/ai-service";
import { independentReviewerConfigured } from "@/lib/ai/model-routing";
import { readPdfSource, renderPdfPages, type PdfSourceCoverage } from "./pdf-pages";

export const leaseFieldTypes = ["text", "date", "checkbox", "initials", "signature"] as const;
export type LeaseFieldType = (typeof leaseFieldTypes)[number];

export type LeaseFieldCandidate = {
  sourceKey: string;
  pageNumber: number;
  type: LeaseFieldType;
  label: string;
  signerRole: string | null;
  proposedValue: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  evidence: string | null;
};

export type LeaseTerms = {
  propertyAddress: string | null;
  unitLabel: string | null;
  landlordNames: string[];
  tenantNames: string[];
  occupantNames: string[];
  startDate: string | null;
  endDate: string | null;
  monthlyRentCents: number | null;
  securityDepositCents: number | null;
  rentDueDay: number | null;
  lateFeeSummary: string | null;
  utilitiesSummary: string | null;
  petSummary: string | null;
  renewalSummary: string | null;
  terminationSummary: string | null;
};

export type LeaseAnalysis = {
  terms: LeaseTerms;
  fields: LeaseFieldCandidate[];
  clauseSummaries: { title: string; summary: string; pageNumber: number; confidence: number }[];
  sourceCoverage: PdfSourceCoverage;
  overallConfidence: number;
  reviewReasons: string[];
};

export type LeaseIndependentReview = {
  status: "passed" | "disagreed" | "reviewer_unavailable";
  deterministicIssues: string[];
  disagreements: string[];
  humanReviewRequired: true;
};

const emptyTerms: LeaseTerms = {
  propertyAddress: null,
  unitLabel: null,
  landlordNames: [],
  tenantNames: [],
  occupantNames: [],
  startDate: null,
  endDate: null,
  monthlyRentCents: null,
  securityDepositCents: null,
  rentDueDay: null,
  lateFeeSummary: null,
  utilitiesSummary: null,
  petSummary: null,
  renewalSummary: null,
  terminationSummary: null,
};

const systemPrompt = `You are a conservative lease-document analysis engine. The original PDF is always authoritative. Extract visible lease terms and suggest fill/signature field locations, but never claim a lease is valid, complete, executed, or legally reviewed. Never invent unreadable text. Coordinates are normalized fractions of the rendered page: x/y are the upper-left corner and width/height are positive, all from 0 to 1. Return JSON only.`;

const requestPrompt = `Return an object with terms, fields, clause_summaries, overall_confidence, and review_reasons.
terms: property_address, unit_label, landlord_names, tenant_names, occupant_names, start_date, end_date, monthly_rent_cents, security_deposit_cents, rent_due_day, late_fee_summary, utilities_summary, pet_summary, renewal_summary, termination_summary.
fields: every visible blank or explicit text/date/checkbox/initials/signature field on these pages, with page_number, type, label, signer_role, proposed_value, x, y, width, height, confidence, evidence. Do not create fields where none are visibly present.
clause_summaries: title, concise factual summary, page_number, confidence. Use null or empty arrays when absent.`;

const fallback = {
  terms: {}, fields: [], clause_summaries: [], overall_confidence: 0,
  review_reasons: ["Lease analysis was unavailable."],
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter((item): item is string => Boolean(item)))] : [];
}

function bounded(value: unknown, fallbackValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallbackValue;
}

function integer(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function cents(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function normalizeTerms(value: unknown): LeaseTerms {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    propertyAddress: text(source.property_address), unitLabel: text(source.unit_label),
    landlordNames: stringArray(source.landlord_names), tenantNames: stringArray(source.tenant_names),
    occupantNames: stringArray(source.occupant_names), startDate: text(source.start_date), endDate: text(source.end_date),
    monthlyRentCents: cents(source.monthly_rent_cents), securityDepositCents: cents(source.security_deposit_cents),
    rentDueDay: integer(source.rent_due_day, 1, 31), lateFeeSummary: text(source.late_fee_summary),
    utilitiesSummary: text(source.utilities_summary), petSummary: text(source.pet_summary),
    renewalSummary: text(source.renewal_summary), terminationSummary: text(source.termination_summary),
  };
}

function normalizePart(raw: Record<string, unknown>, allowedPages: Set<number>) {
  const fields: LeaseFieldCandidate[] = [];
  for (const item of (Array.isArray(raw.fields) ? raw.fields : [])) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const pageNumber = integer(row.page_number, 1, 10_000);
    const type = text(row.type) as LeaseFieldType | null;
    const label = text(row.label);
    if (!pageNumber || !allowedPages.has(pageNumber) || !type || !leaseFieldTypes.includes(type) || !label) continue;
    const x = bounded(row.x), y = bounded(row.y), width = bounded(row.width), height = bounded(row.height);
    if (width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) continue;
    fields.push({
      sourceKey: `${pageNumber}:${type}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}:${x.toFixed(3)}:${y.toFixed(3)}`,
      pageNumber, type, label, signerRole: text(row.signer_role), proposedValue: text(row.proposed_value),
      x, y, width, height, confidence: bounded(row.confidence), evidence: text(row.evidence),
    });
  }
  const clauseSummaries = (Array.isArray(raw.clause_summaries) ? raw.clause_summaries : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title), summary = text(row.summary), pageNumber = integer(row.page_number, 1, 10_000);
    return title && summary && pageNumber && allowedPages.has(pageNumber)
      ? [{ title, summary, pageNumber, confidence: bounded(row.confidence) }]
      : [];
  });
  return {
    terms: normalizeTerms(raw.terms), fields, clauseSummaries,
    overallConfidence: bounded(raw.overall_confidence),
    reviewReasons: stringArray(raw.review_reasons),
  };
}

function mergeTerms(parts: LeaseTerms[]) {
  const first = <K extends keyof LeaseTerms>(key: K) => parts.map((part) => part[key]).find((value) => Array.isArray(value) ? value.length : value !== null) ?? emptyTerms[key];
  return Object.fromEntries(Object.keys(emptyTerms).map((key) => [key, first(key as keyof LeaseTerms)])) as LeaseTerms;
}

function normalizeComparable(value: unknown) {
  return JSON.stringify(value ?? null).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function deterministicLeaseIssues(analysis: LeaseAnalysis, expected?: Partial<LeaseTerms>) {
  const issues: string[] = [];
  const coverage = analysis.sourceCoverage;
  if (coverage.totalPages < 1 || coverage.attemptedPages.length !== coverage.totalPages || coverage.failedPages.length || coverage.omittedPages.length) {
    issues.push("Not every lease page produced a usable analysis.");
  }
  if (analysis.terms.startDate && analysis.terms.endDate && analysis.terms.startDate >= analysis.terms.endDate) issues.push("Lease start and end dates are not in chronological order.");
  if (!analysis.fields.some((field) => field.type === "signature")) issues.push("No visible signature field was identified.");
  if (analysis.fields.some((field) => field.x + field.width > 1 || field.y + field.height > 1)) issues.push("One or more field suggestions exceed page bounds.");
  if (expected) {
    for (const key of ["propertyAddress", "unitLabel", "startDate", "endDate", "monthlyRentCents", "securityDepositCents"] as const) {
      if (expected[key] !== undefined && expected[key] !== null && normalizeComparable(expected[key]) !== normalizeComparable(analysis.terms[key])) {
        issues.push(`${key} differs from the Homes4Rent record.`);
      }
    }
  }
  return issues;
}

export function compareLeaseAnalyses(primary: LeaseAnalysis, reviewer: LeaseAnalysis | null, expected?: Partial<LeaseTerms>): LeaseIndependentReview {
  const deterministicIssues = deterministicLeaseIssues(primary, expected);
  if (!reviewer) return { status: "reviewer_unavailable", deterministicIssues, disagreements: [], humanReviewRequired: true };
  const disagreements: string[] = [];
  for (const key of ["propertyAddress", "unitLabel", "landlordNames", "tenantNames", "startDate", "endDate", "monthlyRentCents", "securityDepositCents", "rentDueDay"] as const) {
    if (normalizeComparable(primary.terms[key]) !== normalizeComparable(reviewer.terms[key])) disagreements.push(`${key} differs between the primary and independent review.`);
  }
  if (primary.fields.filter((field) => field.type === "signature").length !== reviewer.fields.filter((field) => field.type === "signature").length) {
    disagreements.push("Signature-field count differs between the primary and independent review.");
  }
  const reviewerIssues = deterministicLeaseIssues(reviewer, expected).map((issue) => `Independent review: ${issue}`);
  const allIssues = [...deterministicIssues, ...reviewerIssues];
  return { status: allIssues.length || disagreements.length ? "disagreed" : "passed", deterministicIssues: allIssues, disagreements, humanReviewRequired: true };
}

async function runPass(input: { workspaceId: string; userId?: string | null; fileName: string; bytes: Uint8Array; reviewPass: boolean }) {
  const source = await readPdfSource(input.bytes, 25);
  const parts: ReturnType<typeof normalizePart>[] = [];
  const readablePages: number[] = [], failedPages: number[] = [];
  for (let offset = 0; offset < source.pages.length; offset += 4) {
    const pages = source.pages.slice(offset, offset + 4);
    const pageNumbers = pages.map((page) => page.pageNumber);
    try {
      const imageUrls = await renderPdfPages({ bytes: input.bytes, pageNumbers, scale: 1.7 });
      const raw = await generateVisionJsonWithAiService<Record<string, unknown>>({
        tenantId: input.workspaceId, userId: input.userId, featureKey: "lease_document_intelligence",
        runType: input.reviewPass ? "independent_review_lease_document" : "lease_document_analysis",
        aiCategory: "core", temperature: 0.05, timeoutMs: 60_000, system: systemPrompt,
        userText: `${requestPrompt}\n\nFile: ${input.fileName}. PDF pages: ${pageNumbers.join(", ")}.`,
        imageUrl: imageUrls[0], imageUrls, mimeType: "image/png", fallback,
        metadata: { fileName: input.fileName, pageNumbers, renderedPageCount: imageUrls.length },
      });
      const part = normalizePart(raw, new Set(pageNumbers));
      parts.push(part);
      (part.overallConfidence > 0 || part.fields.length || part.clauseSummaries.length ? readablePages : failedPages).push(...pageNumbers);
    } catch {
      failedPages.push(...pageNumbers);
    }
  }
  const terms = mergeTerms(parts.map((part) => part.terms));
  const confidences = parts.map((part) => part.overallConfidence).filter((value) => value > 0);
  return {
    terms,
    fields: parts.flatMap((part) => part.fields),
    clauseSummaries: parts.flatMap((part) => part.clauseSummaries),
    sourceCoverage: {
      totalPages: source.totalPages, attemptedPages: source.pages.map((page) => page.pageNumber),
      readablePages, failedPages, omittedPages: source.omittedPages,
    },
    overallConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
    reviewReasons: [...new Set(parts.flatMap((part) => part.reviewReasons).concat(
      source.omittedPages.length ? [`The lease exceeds 25 pages; omitted pages: ${source.omittedPages.join(", ")}.`] : [],
      failedPages.length ? [`Analysis failed on page(s) ${failedPages.join(", ")}.`] : [],
    ))],
  } satisfies LeaseAnalysis;
}

export async function analyzeLeaseDocument(input: {
  workspaceId: string;
  userId?: string | null;
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  expectedTerms?: Partial<LeaseTerms>;
}) {
  if (input.mimeType !== "application/pdf") throw new Error("Lease intelligence currently requires the original PDF.");
  if (!input.fileBytes.byteLength) throw new Error("The lease PDF is empty.");
  const primary = await runPass({ ...input, bytes: input.fileBytes, reviewPass: false });
  const reviewerAvailable = independentReviewerConfigured({ primaryRunType: "lease_document_analysis", requestType: "vision_json" });
  const reviewer = reviewerAvailable ? await runPass({ ...input, bytes: input.fileBytes, reviewPass: true }) : null;
  return { primary, reviewer, review: compareLeaseAnalyses(primary, reviewer, input.expectedTerms), reviewerAvailable };
}
