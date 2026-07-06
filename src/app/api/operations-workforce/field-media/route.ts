import { NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { extractReceiptFields } from "@/lib/operations-workforce/receipt-extraction";

const payloadSchema = z.object({
  tenantId: z.string().uuid(),
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  mediaType: z.enum(["photo", "video", "document", "receipt", "ai_walkthrough"]).default("photo"),
  title: z.string().min(2).max(180),
  fileUrl: z.string().url().optional(),
  aiSummary: z.string().max(4000).optional(),
  consentStatus: z.enum(["internal_only", "permission_requested", "approved_for_customer", "approved_for_marketing"]).default("internal_only"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function validToken(request: Request) {
  const expected = env.WORKFORCE_INTAKE_TOKEN ?? env.OWNER_COMMAND_CENTER_TOKEN;
  return Boolean(expected && bearer(request) === expected);
}

export async function POST(request: Request) {
  if (!validToken(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid field media payload" }, { status: 400 });
  }

  const media = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_field_media (
      tenant_id, worker_id, assignment_id, media_type, title, file_url, ai_summary,
      customer_visible, consent_status, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    returning id
    `,
    [
      parsed.data.tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.mediaType,
      parsed.data.title,
      parsed.data.fileUrl ?? null,
      parsed.data.aiSummary ?? null,
      parsed.data.consentStatus === "approved_for_customer" || parsed.data.consentStatus === "approved_for_marketing",
      parsed.data.consentStatus,
      JSON.stringify({ ...(parsed.data.metadata ?? {}), source: "operations_workforce_api" })
    ]
  );

  const mediaId = media?.rows[0]?.id ?? null;
  let receiptExtractionId: string | null = null;
  if (mediaId && parsed.data.mediaType === "receipt") {
    const extracted = extractReceiptFields({ vendor: parsed.data.title, text: parsed.data.aiSummary ?? parsed.data.title });
    const receipt = await queryPostgres<{ id: string }>(
      `
      insert into public.operations_receipt_extractions (
        tenant_id, field_media_id, vendor, extracted_total_cents, confidence, extracted_text, extracted_fields_json
      )
      values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      returning id
      `,
      [
        parsed.data.tenantId,
        mediaId,
        extracted.vendor,
        extracted.totalCents,
        extracted.confidence,
        extracted.extractedText,
        JSON.stringify(extracted.fields)
      ]
    );
    receiptExtractionId = receipt?.rows[0]?.id ?? null;
  }

  return NextResponse.json({ ok: true, id: mediaId, receiptExtractionId });
}
