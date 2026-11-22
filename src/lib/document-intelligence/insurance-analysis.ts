import { generateVisionJsonWithAiService } from "@/lib/ai/ai-service";
import { independentReviewerConfigured } from "@/lib/ai/model-routing";
import { readPdfSource, renderPdfPages, type PdfSourceCoverage } from "./pdf-pages";

export const insuranceMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export type InsuranceMimeType = (typeof insuranceMimeTypes)[number];

export type InsuranceFacts = {
  insurer: string | null;
  policyNumber: string | null;
  namedInsured: string[];
  insuredAddress: string | null;
  unitLabel: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  liabilityLimitCents: number | null;
  fireOrPremisesDamageSummary: string | null;
  cancellationStatus: "active" | "canceled" | "unknown";
};

export type InsuranceEvidence = {
  field: keyof InsuranceFacts;
  pageNumber: number;
  evidence: string;
  confidence: number;
};

export type InsuranceAnalysis = {
  facts: InsuranceFacts;
  evidence: InsuranceEvidence[];
  sourceCoverage: PdfSourceCoverage;
  overallConfidence: number;
  reviewReasons: string[];
};

export type InsuranceExpected = {
  tenantName?: string | null;
  insuredAddress?: string | null;
  unitLabel?: string | null;
};

export type InsuranceIndependentReview = {
  status: "passed" | "disagreed" | "reviewer_unavailable";
  deterministicIssues: string[];
  disagreements: string[];
  humanReviewRequired: true;
};

const emptyFacts: InsuranceFacts = {
  insurer: null, policyNumber: null, namedInsured: [], insuredAddress: null, unitLabel: null,
  effectiveDate: null, expirationDate: null, liabilityLimitCents: null,
  fireOrPremisesDamageSummary: null, cancellationStatus: "unknown",
};

const systemPrompt = `You are a conservative renters-insurance document extraction engine. The original document is always authoritative. Extract only visible facts. Never infer that coverage is active, sufficient, legally compliant, or verified. A declarations page may not prove cancellation status, exclusions, endorsements, or all fire/damage-to-premises coverage. Never invent unreadable values. Return JSON only.`;

const requestPrompt = `Return an object with facts, evidence, overall_confidence, and review_reasons.
facts: insurer, policy_number, named_insured, insured_address, unit_label, effective_date, expiration_date, liability_limit_cents, fire_or_premises_damage_summary, cancellation_status.
cancellation_status must be active, canceled, or unknown and must be unknown unless the document explicitly states the status.
evidence: one item per extracted material field with field, page_number, a short exact-source description, and confidence from 0 to 1.
Dates must be YYYY-MM-DD when unambiguous, otherwise null. Money is integer cents. Use null or empty arrays when absent.`;

const fallback = { facts: {}, evidence: [], overall_confidence: 0, review_reasons: ["Insurance extraction was unavailable."] };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2_000) : null;
}

function bounded(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter((item): item is string => Boolean(item)))] : [];
}

function cents(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function isoDate(value: unknown) {
  const candidate = text(value);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== candidate ? null : candidate;
}

export function normalizeInsuranceAnalysis(raw: Record<string, unknown>, coverage: PdfSourceCoverage): InsuranceAnalysis {
  const source = raw.facts && typeof raw.facts === "object" ? raw.facts as Record<string, unknown> : {};
  const cancellation = text(source.cancellation_status);
  const facts: InsuranceFacts = {
    insurer: text(source.insurer), policyNumber: text(source.policy_number), namedInsured: stringArray(source.named_insured),
    insuredAddress: text(source.insured_address), unitLabel: text(source.unit_label), effectiveDate: isoDate(source.effective_date),
    expirationDate: isoDate(source.expiration_date), liabilityLimitCents: cents(source.liability_limit_cents),
    fireOrPremisesDamageSummary: text(source.fire_or_premises_damage_summary),
    cancellationStatus: cancellation === "active" || cancellation === "canceled" ? cancellation : "unknown",
  };
  const validFields = new Set(Object.keys(emptyFacts));
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).flatMap((item): InsuranceEvidence[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const field = text(row.field)?.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof InsuranceFacts | undefined;
    const pageNumber = Number(row.page_number);
    const proof = text(row.evidence);
    if (!field || !validFields.has(field) || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > coverage.totalPages || !proof) return [];
    return [{ field, pageNumber, evidence: proof, confidence: bounded(row.confidence) }];
  });
  return { facts, evidence, sourceCoverage: coverage, overallConfidence: bounded(raw.overall_confidence), reviewReasons: stringArray(raw.review_reasons) };
}

function comparable(value: unknown) {
  return JSON.stringify(value ?? null).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function deterministicInsuranceIssues(analysis: InsuranceAnalysis, expected: InsuranceExpected = {}) {
  const issues: string[] = [];
  const coverage = analysis.sourceCoverage;
  if (coverage.totalPages < 1 || coverage.attemptedPages.length !== coverage.totalPages || coverage.failedPages.length || coverage.omittedPages.length) issues.push("Not every insurance-document page produced a usable analysis.");
  if (!analysis.facts.insurer) issues.push("The insurer was not identified.");
  if (!analysis.facts.policyNumber) issues.push("The policy number was not identified.");
  if (!analysis.facts.expirationDate) issues.push("The policy expiration date was not identified.");
  if (analysis.facts.effectiveDate && analysis.facts.expirationDate && analysis.facts.effectiveDate > analysis.facts.expirationDate) issues.push("The extracted effective date is after the expiration date.");
  if (analysis.facts.cancellationStatus === "unknown") issues.push("Current cancellation status is not established by the document.");
  if (expected.tenantName && !analysis.facts.namedInsured.some((name) => comparable(name) === comparable(expected.tenantName))) issues.push("The H4R tenant name was not an exact normalized match to a named insured.");
  if (expected.insuredAddress && comparable(analysis.facts.insuredAddress) !== comparable(expected.insuredAddress)) issues.push("The insured address differs from the H4R rental address.");
  if (expected.unitLabel && analysis.facts.unitLabel && comparable(analysis.facts.unitLabel) !== comparable(expected.unitLabel)) issues.push("The unit differs from the H4R unit.");
  return issues;
}

export function compareInsuranceAnalyses(primary: InsuranceAnalysis, reviewer: InsuranceAnalysis | null, expected: InsuranceExpected = {}): InsuranceIndependentReview {
  const deterministicIssues = deterministicInsuranceIssues(primary, expected);
  if (!reviewer) return { status: "reviewer_unavailable", deterministicIssues, disagreements: [], humanReviewRequired: true };
  const disagreements: string[] = [];
  for (const key of ["insurer", "policyNumber", "namedInsured", "insuredAddress", "unitLabel", "effectiveDate", "expirationDate", "liabilityLimitCents", "cancellationStatus"] as const) {
    if (comparable(primary.facts[key]) !== comparable(reviewer.facts[key])) disagreements.push(`${key} differs between the primary and independent review.`);
  }
  const reviewerIssues = deterministicInsuranceIssues(reviewer, expected).map((issue) => `Independent review: ${issue}`);
  return { status: deterministicIssues.length || reviewerIssues.length || disagreements.length ? "disagreed" : "passed", deterministicIssues: [...deterministicIssues, ...reviewerIssues], disagreements, humanReviewRequired: true };
}

async function runPass(input: { workspaceId: string; fileName: string; mimeType: InsuranceMimeType; bytes: Uint8Array; reviewPass: boolean }) {
  const analyses: InsuranceAnalysis[] = [];
  let totalPages = 1, omittedPages: number[] = [], attemptedPages: number[] = [], readablePages: number[] = [], failedPages: number[] = [];
  const runImages = async (imageUrls: string[], pageNumbers: number[]) => {
    const raw = await generateVisionJsonWithAiService<Record<string, unknown>>({
      tenantId: input.workspaceId, featureKey: "insurance_document_intelligence",
      runType: input.reviewPass ? "independent_review_insurance_document" : "insurance_document_analysis",
      aiCategory: "core", temperature: 0.05, timeoutMs: 90_000, system: systemPrompt,
      userText: `${requestPrompt}\n\nFile: ${input.fileName}. Pages: ${pageNumbers.join(", ")}.`,
      imageUrl: imageUrls[0], imageUrls, mimeType: "image/png", fallback,
      metadata: { fileName: input.fileName, sourceMimeType: input.mimeType, pageNumbers, totalPages },
    });
    const coverage = { totalPages, attemptedPages: pageNumbers, readablePages: pageNumbers, failedPages: [], omittedPages };
    analyses.push(normalizeInsuranceAnalysis(raw, coverage));
    readablePages.push(...pageNumbers);
  };
  if (input.mimeType === "application/pdf") {
    const source = await readPdfSource(input.bytes, 20);
    totalPages = source.totalPages; omittedPages = source.omittedPages; attemptedPages = source.pages.map((page) => page.pageNumber);
    for (let offset = 0; offset < attemptedPages.length; offset += 4) {
      const pageNumbers = attemptedPages.slice(offset, offset + 4);
      try { await runImages(await renderPdfPages({ bytes: input.bytes, pageNumbers, scale: 1.7 }), pageNumbers); }
      catch { failedPages.push(...pageNumbers); }
    }
  } else {
    attemptedPages = [1];
    try { await runImages([`data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`], [1]); }
    catch { failedPages = [1]; }
  }
  const coverage = { totalPages, attemptedPages, readablePages, failedPages, omittedPages };
  const first = <K extends keyof InsuranceFacts>(key: K) => analyses.map((analysis) => analysis.facts[key]).find((value) => Array.isArray(value) ? value.length : value !== null && value !== "unknown") ?? emptyFacts[key];
  const facts = Object.fromEntries(Object.keys(emptyFacts).map((key) => [key, first(key as keyof InsuranceFacts)])) as InsuranceFacts;
  const confidences = analyses.map((analysis) => analysis.overallConfidence).filter((value) => value > 0);
  return {
    facts, evidence: analyses.flatMap((analysis) => analysis.evidence), sourceCoverage: coverage,
    overallConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
    reviewReasons: [...new Set(analyses.flatMap((analysis) => analysis.reviewReasons).concat(
      omittedPages.length ? [`The insurance document exceeds 20 pages; omitted pages: ${omittedPages.join(", ")}.`] : [],
      failedPages.length ? [`Analysis failed on page(s) ${failedPages.join(", ")}.`] : [],
    ))],
  } satisfies InsuranceAnalysis;
}

export async function analyzeInsuranceDocument(input: { workspaceId: string; fileName: string; mimeType: string; fileBytes: Uint8Array; expected?: InsuranceExpected }) {
  if (!insuranceMimeTypes.includes(input.mimeType as InsuranceMimeType)) throw new Error("Insurance intelligence accepts PDF, JPEG, or PNG files.");
  if (!input.fileBytes.byteLength) throw new Error("The insurance document is empty.");
  const typed = { ...input, mimeType: input.mimeType as InsuranceMimeType, bytes: input.fileBytes };
  const primary = await runPass({ ...typed, reviewPass: false });
  const reviewerAvailable = independentReviewerConfigured({ primaryRunType: "insurance_document_analysis", requestType: "vision_json" });
  const reviewer = reviewerAvailable ? await runPass({ ...typed, reviewPass: true }) : null;
  return { primary, reviewer, review: compareInsuranceAnalyses(primary, reviewer, input.expected), reviewerAvailable };
}
