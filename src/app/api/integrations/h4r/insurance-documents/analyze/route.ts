import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeInsuranceDocument } from "@/lib/document-intelligence/insurance-analysis";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { claimH4rBridgeNonce, verifyH4rSignedRequest } from "@/lib/integrations/h4r/request-auth";
import { assertCompanionActionPermitted } from "@/lib/integrations/companion-product-contract";

export const maxDuration = 300;
const maximumBytes = 15 * 1024 * 1024;

const bodySchema = z.object({
  workspace_id: z.string().uuid(), document_id: z.string().uuid(), tenant_id: z.string().uuid(),
  file_name: z.string().min(1).max(240), mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  byte_count: z.number().int().positive().max(maximumBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  download_url: z.string().url().max(4000),
  expected: z.object({ tenantName: z.string().max(300).nullable().optional(), insuredAddress: z.string().max(500).nullable().optional(), unitLabel: z.string().max(100).nullable().optional() }).optional(),
});

function allowedDownloadUrl(value: string) {
  if (!env.H4R_DOCUMENT_ORIGIN) return false;
  try {
    const candidate = new URL(value), configured = new URL(env.H4R_DOCUMENT_ORIGIN);
    return candidate.protocol === "https:" && candidate.origin === configured.origin && candidate.pathname.startsWith("/storage/v1/object/sign/h4r-documents/");
  } catch { return false; }
}

async function downloadSource(url: string, expectedBytes: number) {
  if (!allowedDownloadUrl(url)) throw new Error("The insurance download URL is not an authorized H4R storage URL.");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("H4R could not provide the insurance document.");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maximumBytes) throw new Error("The insurance document exceeds the 15 MB analysis limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > maximumBytes || bytes.byteLength !== expectedBytes) throw new Error("The downloaded insurance document does not match the H4R source record.");
    return bytes;
  } finally { clearTimeout(timeout); }
}

function responseFromStored(input: { documentId: string; analysisId: string; h4rDocumentId: string; primary: Record<string, unknown>; reviewStatus: string; issues: string[]; disagreements: string[]; reused?: boolean }) {
  return NextResponse.json({
    ok: true, mode: "review_only", reused_existing: Boolean(input.reused), document_id: input.documentId,
    analysis_id: input.analysisId, h4r_document_id: input.h4rDocumentId, facts: input.primary.facts ?? {},
    evidence: input.primary.evidence ?? [], source_coverage: input.primary.sourceCoverage ?? {},
    overall_confidence: input.primary.overallConfidence ?? 0,
    independent_review: { status: input.reviewStatus, deterministicIssues: input.issues, disagreements: input.disagreements, humanReviewRequired: true },
    warnings: ["The original insurance document remains authoritative.", "OCR did not verify coverage, cancellation status, sufficiency, or lease compliance.", "A Homes4Rent manager must review and verify the record."],
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyH4rSignedRequest(request, rawBody);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (!(await claimH4rBridgeNonce(verified.nonce))) return NextResponse.json({ ok: false, error: "Duplicate bridge nonce." }, { status: 409 });
  let json: unknown;
  try { json = JSON.parse(rawBody || "{}"); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid H4R insurance-analysis request." }, { status: 400 });
  const input = parsed.data;
  assertCompanionActionPermitted({ productKey: "h4r", actionKey: "analyze_insurance_document", requestedMode: "prepare", idempotencyKey: `${input.workspace_id}:${input.document_id}:${input.sha256}`, approvalGatePresent: true });
  if (!allowedDownloadUrl(input.download_url)) return NextResponse.json({ ok: false, error: "H4R document storage is not configured or authorized." }, { status: 503 });

  const mapping = (await queryPostgres<{ ferocity_tenant_id: string }>(
    `select ferocity_tenant_id from public.h4r_ferocity_bridge_workspaces where h4r_workspace_id=$1 and status in ('shadow','review','active') limit 1`, [input.workspace_id],
  ))?.rows[0];
  if (!mapping) return NextResponse.json({ ok: false, error: "H4R workspace is not authorized for document intelligence." }, { status: 403 });

  const cached = (await queryPostgres<{ document_id: string; analysis_id: string; primary_result_json: Record<string, unknown>; review_status: string; deterministic_issues_json: string[]; disagreements_json: string[] }>(
    `select d.id document_id,a.id analysis_id,a.primary_result_json,coalesce(r.status,'reviewer_unavailable') review_status,a.deterministic_issues_json,a.disagreements_json
     from public.document_intelligence_documents d join public.document_intelligence_analyses a on a.tenant_id=d.tenant_id and a.document_id=d.id and a.analysis_type='insurance_policy_coverage'
     left join lateral (select status from public.ai_independent_reviews where tenant_id=d.tenant_id and subject_type='insurance_document' and subject_id=d.id order by created_at desc limit 1) r on true
     where d.tenant_id=$1 and d.source_product='homes4rent' and d.source_workspace_ref=$2 and d.source_document_ref=$3 and d.content_sha256=$4 and d.status<>'rejected' and a.status in ('needs_review','ready') limit 1`,
    [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, input.sha256.toLowerCase()],
  ))?.rows[0];
  if (cached) return responseFromStored({ documentId: cached.document_id, analysisId: cached.analysis_id, h4rDocumentId: input.document_id, primary: cached.primary_result_json, reviewStatus: cached.review_status, issues: cached.deterministic_issues_json ?? [], disagreements: cached.disagreements_json ?? [], reused: true });

  try {
    const bytes = await downloadSource(input.download_url, input.byte_count);
    const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(input.sha256.toLowerCase(), "hex"))) return NextResponse.json({ ok: false, error: "The insurance checksum does not match the H4R source record." }, { status: 422 });
    const result = await analyzeInsuranceDocument({ workspaceId: mapping.ferocity_tenant_id, fileName: input.file_name, mimeType: input.mime_type, fileBytes: bytes, expected: input.expected });
    const stored = await withPostgresTransactionResult(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`h4r-insurance:${input.workspace_id}:${input.document_id}:${actualHash}`]);
      let documentId = (await client.query<{ id: string }>(`select id from public.document_intelligence_documents where tenant_id=$1 and source_product='homes4rent' and source_workspace_ref=$2 and source_document_ref=$3 and content_sha256=$4 and status<>'rejected' limit 1`, [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, actualHash])).rows[0]?.id;
      if (!documentId) documentId = (await client.query<{ id: string }>(
        `insert into public.document_intelligence_documents (tenant_id,source_product,source_workspace_ref,source_document_ref,source_channel,source_message_ref,purpose,status,document_type,original_bucket,original_storage_path,original_file_name,original_mime_type,original_byte_count,content_sha256,normalized_json,overall_confidence,review_reasons_json)
         values ($1,'homes4rent',$2,$3,'api',$4,'insurance_verification','needs_review','insurance_policy','external:h4r','private:h4r-documents',$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb) returning id`,
        [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, input.tenant_id, input.file_name, input.mime_type, bytes.byteLength, actualHash, JSON.stringify(result.primary), result.primary.overallConfidence, JSON.stringify([...result.primary.reviewReasons, ...result.review.deterministicIssues, ...result.review.disagreements])],
      )).rows[0]?.id;
      if (!documentId) throw new Error("Could not preserve the insurance source record.");
      const analysisId = (await client.query<{ id: string }>(
        `insert into public.document_intelligence_analyses (tenant_id,document_id,analysis_type,status,primary_result_json,reviewer_result_json,deterministic_issues_json,disagreements_json,human_review_required)
         values ($1,$2,'insurance_policy_coverage','needs_review',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,true)
         on conflict (document_id,analysis_type) do update set status='needs_review',primary_result_json=excluded.primary_result_json,reviewer_result_json=excluded.reviewer_result_json,deterministic_issues_json=excluded.deterministic_issues_json,disagreements_json=excluded.disagreements_json,human_review_required=true,processing_error=null,updated_at=now() returning id`,
        [mapping.ferocity_tenant_id, documentId, JSON.stringify(result.primary), result.reviewer ? JSON.stringify(result.reviewer) : null, JSON.stringify(result.review.deterministicIssues), JSON.stringify(result.review.disagreements)],
      )).rows[0]?.id;
      if (!analysisId) throw new Error("Could not preserve the insurance analysis record.");
      await client.query(
        `insert into public.ai_independent_reviews (tenant_id,subject_type,subject_id,risk_tier,status,primary_run_type,reviewer_run_type,deterministic_checks_json,disagreements_json,human_review_required,metadata_json)
         values ($1,'insurance_document',$2,'critical',$3,'insurance_document_analysis',$4,$5::jsonb,$6::jsonb,true,$7::jsonb)`,
        [mapping.ferocity_tenant_id, documentId, result.review.status, result.reviewerAvailable ? "independent_review_insurance_document" : null, JSON.stringify(result.review.deterministicIssues), JSON.stringify(result.review.disagreements), JSON.stringify({ sourceProduct: "homes4rent", h4rWorkspaceId: input.workspace_id, h4rDocumentId: input.document_id, h4rTenantId: input.tenant_id })],
      );
      return { documentId, analysisId };
    });
    if (!stored.ok) return NextResponse.json({ ok: false, error: "The insurance document was analyzed but its review record could not be preserved." }, { status: 503 });
    return responseFromStored({ documentId: stored.value.documentId, analysisId: stored.value.analysisId, h4rDocumentId: input.document_id, primary: result.primary as unknown as Record<string, unknown>, reviewStatus: result.review.status, issues: result.review.deterministicIssues, disagreements: result.review.disagreements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insurance analysis failed.";
    return NextResponse.json({ ok: false, error: message }, { status: /authorized|configured/.test(message) ? 503 : 422 });
  }
}
