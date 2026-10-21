import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeLeaseDocument, type LeaseTerms } from "@/lib/document-intelligence/lease-analysis";
import { withPostgresTransactionResult, queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { claimH4rBridgeNonce, verifyH4rSignedRequest } from "@/lib/integrations/h4r/request-auth";
import { assertCompanionActionPermitted } from "@/lib/integrations/companion-product-contract";

export const maxDuration = 300;

const maximumLeaseBytes = 15 * 1024 * 1024;
const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  document_id: z.string().uuid(),
  lease_id: z.string().uuid().nullable().optional(),
  file_name: z.string().min(1).max(240),
  mime_type: z.literal("application/pdf"),
  byte_count: z.number().int().positive().max(maximumLeaseBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  download_url: z.string().url().max(4000),
  expected_terms: z.object({
    propertyAddress: z.string().max(500).nullable().optional(),
    unitLabel: z.string().max(100).nullable().optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    monthlyRentCents: z.number().int().nonnegative().nullable().optional(),
    securityDepositCents: z.number().int().nonnegative().nullable().optional(),
  }).optional(),
});

function allowedDownloadUrl(value: string) {
  if (!env.H4R_DOCUMENT_ORIGIN) return false;
  try {
    const candidate = new URL(value);
    const configured = new URL(env.H4R_DOCUMENT_ORIGIN);
    return candidate.protocol === "https:"
      && candidate.origin === configured.origin
      && candidate.pathname.startsWith("/storage/v1/object/sign/h4r-documents/");
  } catch {
    return false;
  }
}

async function downloadLease(url: string, expectedBytes: number) {
  if (!allowedDownloadUrl(url)) throw new Error("The lease download URL is not an authorized H4R storage URL.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("H4R could not provide the lease document.");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maximumLeaseBytes) throw new Error("The lease exceeds the 15 MB analysis limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > maximumLeaseBytes) throw new Error("The lease is empty or exceeds the 15 MB analysis limit.");
    if (bytes.byteLength !== expectedBytes) throw new Error("The downloaded lease size does not match the H4R source record.");
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyH4rSignedRequest(request, rawBody);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (!(await claimH4rBridgeNonce(verified.nonce))) return NextResponse.json({ ok: false, error: "Duplicate bridge nonce." }, { status: 409 });

  let json: unknown;
  try { json = JSON.parse(rawBody || "{}"); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid H4R lease-analysis request." }, { status: 400 });
  const input = parsed.data;
  assertCompanionActionPermitted({
    productKey: "h4r", actionKey: "analyze_lease_document", requestedMode: "prepare",
    idempotencyKey: `${input.workspace_id}:${input.document_id}:${input.sha256}`,
    approvalGatePresent: true,
  });
  if (!allowedDownloadUrl(input.download_url)) return NextResponse.json({ ok: false, error: "H4R document storage is not configured or authorized." }, { status: 503 });

  const mappingResult = await queryPostgres<{ ferocity_tenant_id: string; status: string }>(
    `select ferocity_tenant_id,status from public.h4r_ferocity_bridge_workspaces
     where h4r_workspace_id=$1 and status in ('shadow','review','active') limit 1`,
    [input.workspace_id],
  );
  const mapping = mappingResult?.rows[0];
  if (!mapping) return NextResponse.json({ ok: false, error: "H4R workspace is not authorized for document intelligence." }, { status: 403 });

  const cachedResult = await queryPostgres<{
    document_id: string; analysis_id: string; primary_result_json: Record<string, unknown>;
    status: string; review_status: "passed" | "disagreed" | "reviewer_unavailable";
    deterministic_issues_json: string[]; disagreements_json: string[];
  }>(
    `select d.id document_id,a.id analysis_id,a.primary_result_json,a.status,
            coalesce(r.status,'reviewer_unavailable') review_status,
            a.deterministic_issues_json,a.disagreements_json
     from public.document_intelligence_documents d
     join public.document_intelligence_analyses a on a.tenant_id=d.tenant_id and a.document_id=d.id
       and a.analysis_type='lease_terms_and_fields'
     left join lateral (
       select status from public.ai_independent_reviews
       where tenant_id=d.tenant_id and subject_type='lease_document' and subject_id=d.id
       order by created_at desc limit 1
     ) r on true
     where d.tenant_id=$1 and d.source_product='homes4rent' and d.source_workspace_ref=$2
       and d.source_document_ref=$3 and d.content_sha256=$4 and d.status<>'rejected'
       and a.status in ('needs_review','ready')
     order by a.updated_at desc limit 1`,
    [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, input.sha256.toLowerCase()],
  );
  const cached = cachedResult?.rows[0];
  if (cached) {
    const primary = cached.primary_result_json ?? {};
    return NextResponse.json({
      ok: true, mode: "review_only", reused_existing: true,
      document_id: cached.document_id, analysis_id: cached.analysis_id, h4r_document_id: input.document_id,
      terms: primary.terms ?? {}, field_suggestions: primary.fields ?? [], clause_summaries: primary.clauseSummaries ?? [],
      source_coverage: primary.sourceCoverage ?? {},
      independent_review: {
        status: cached.review_status,
        deterministicIssues: cached.deterministic_issues_json ?? [], disagreements: cached.disagreements_json ?? [], humanReviewRequired: true,
      },
      warnings: ["The original PDF remains authoritative.", "No field was accepted and no lease was sent or signed."],
    });
  }

  try {
    const bytes = await downloadLease(input.download_url, input.byte_count);
    const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(input.sha256.toLowerCase(), "hex"))) {
      return NextResponse.json({ ok: false, error: "The lease checksum does not match the H4R source record." }, { status: 422 });
    }
    const result = await analyzeLeaseDocument({
      workspaceId: mapping.ferocity_tenant_id,
      fileName: input.file_name,
      mimeType: input.mime_type,
      fileBytes: bytes,
      expectedTerms: input.expected_terms as Partial<LeaseTerms> | undefined,
    });
    const stored = await withPostgresTransactionResult(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`h4r-lease:${input.workspace_id}:${input.document_id}:${actualHash}`]);
      let documentId = (await client.query<{ id: string }>(
        `select id from public.document_intelligence_documents
         where tenant_id=$1 and source_product='homes4rent' and source_workspace_ref=$2
           and source_document_ref=$3 and content_sha256=$4 and status<>'rejected'
         order by created_at desc limit 1`,
        [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, actualHash],
      )).rows[0]?.id;
      if (!documentId) {
        documentId = (await client.query<{ id: string }>(
          `insert into public.document_intelligence_documents (
             tenant_id,source_product,source_workspace_ref,source_document_ref,source_channel,source_message_ref,
             purpose,status,document_type,original_bucket,original_storage_path,original_file_name,
             original_mime_type,original_byte_count,content_sha256,normalized_json,overall_confidence,review_reasons_json
           ) values ($1,'homes4rent',$2,$3,'api',$4,'lease_workflow','needs_review','lease',
             'external:h4r','private:h4r-documents',$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb) returning id`,
          [mapping.ferocity_tenant_id, input.workspace_id, input.document_id, input.lease_id ?? input.document_id,
            input.file_name, input.mime_type, bytes.byteLength, actualHash, JSON.stringify(result.primary),
            result.primary.overallConfidence, JSON.stringify([...result.primary.reviewReasons, ...result.review.deterministicIssues, ...result.review.disagreements])],
        )).rows[0]?.id;
      }
      if (!documentId) throw new Error("Could not preserve the lease analysis record.");
      const analysis = await client.query<{ id: string }>(
        `insert into public.document_intelligence_analyses (
           tenant_id,document_id,analysis_type,status,primary_result_json,reviewer_result_json,
           deterministic_issues_json,disagreements_json,human_review_required
         ) values ($1,$2,'lease_terms_and_fields','needs_review',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,true)
         on conflict (document_id,analysis_type) do update set status='needs_review',
           primary_result_json=excluded.primary_result_json,reviewer_result_json=excluded.reviewer_result_json,
           deterministic_issues_json=excluded.deterministic_issues_json,disagreements_json=excluded.disagreements_json,
           human_review_required=true,processing_error=null,updated_at=now()
         returning id`,
        [mapping.ferocity_tenant_id, documentId, JSON.stringify(result.primary), result.reviewer ? JSON.stringify(result.reviewer) : null,
          JSON.stringify(result.review.deterministicIssues), JSON.stringify(result.review.disagreements)],
      );
      const analysisId = analysis.rows[0]?.id;
      if (!analysisId) throw new Error("Could not preserve the lease review record.");
      await client.query(`delete from public.document_intelligence_field_suggestions where tenant_id=$1 and analysis_id=$2 and status='suggested'`, [mapping.ferocity_tenant_id, analysisId]);
      for (const field of result.primary.fields) {
        await client.query(
          `insert into public.document_intelligence_field_suggestions (
             tenant_id,analysis_id,source_key,page_number,field_type,label,signer_role,proposed_value,
             x,y,width,height,confidence,evidence,metadata_json
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
           on conflict (analysis_id,source_key) do update set label=excluded.label,signer_role=excluded.signer_role,
             proposed_value=excluded.proposed_value,x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,
             confidence=excluded.confidence,evidence=excluded.evidence,updated_at=now()`,
          [mapping.ferocity_tenant_id, analysisId, field.sourceKey, field.pageNumber, field.type, field.label,
            field.signerRole, field.proposedValue, field.x, field.y, field.width, field.height, field.confidence,
            field.evidence, JSON.stringify({ sourceProduct: "homes4rent", h4rDocumentId: input.document_id, h4rLeaseId: input.lease_id ?? null })],
        );
      }
      await client.query(
        `insert into public.ai_independent_reviews (
           tenant_id,subject_type,subject_id,risk_tier,status,primary_run_type,reviewer_run_type,
           deterministic_checks_json,disagreements_json,human_review_required,metadata_json
         ) values ($1,'lease_document',$2,'critical',$3,'lease_document_analysis',$4,$5::jsonb,$6::jsonb,true,$7::jsonb)`,
        [mapping.ferocity_tenant_id, documentId, result.review.status,
          result.reviewerAvailable ? 'independent_review_lease_document' : null,
          JSON.stringify(result.review.deterministicIssues), JSON.stringify(result.review.disagreements),
          JSON.stringify({ sourceProduct: "homes4rent", h4rWorkspaceId: input.workspace_id, h4rDocumentId: input.document_id })],
      );
      return { documentId, analysisId };
    });
    if (!stored.ok) return NextResponse.json({ ok: false, error: "The lease was analyzed but its review record could not be preserved." }, { status: 503 });
    return NextResponse.json({
      ok: true, mode: "review_only", document_id: stored.value.documentId, analysis_id: stored.value.analysisId,
      h4r_document_id: input.document_id, terms: result.primary.terms, field_suggestions: result.primary.fields,
      clause_summaries: result.primary.clauseSummaries, source_coverage: result.primary.sourceCoverage,
      independent_review: result.review,
      warnings: ["The original PDF remains authoritative.", "No field was accepted and no lease was sent or signed."],
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lease analysis failed.";
    return NextResponse.json({ ok: false, error: message }, { status: /authorized|configured/.test(message) ? 503 : 422 });
  }
}
