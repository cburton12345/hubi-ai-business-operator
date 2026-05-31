"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPortalProofContext, getProofRequestContext, proofTitle } from "@/lib/ugc/proof";

const proofBucket = "ugc-proof-assets";
const maxUploadBytes = 25 * 1024 * 1024;

const proofSubmissionSchema = z.object({
  token: z.string().min(8),
  mode: z.enum(["portal", "request"]),
  customerName: z.string().trim().max(160).optional(),
  customerEmail: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(80).optional(),
  serviceType: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(80).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  storyText: z.string().trim().max(4000).optional(),
  resultSummary: z.string().trim().max(1000).optional(),
  photoUrls: z.string().trim().max(5000).optional(),
  videoUrls: z.string().trim().max(5000).optional(),
  permissionMarketing: z.literal("on").optional(),
  permissionUseName: z.literal("on").optional(),
  permissionUseLocation: z.literal("on").optional(),
  permissionContactFollowup: z.literal("on").optional()
});

function safeFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "asset";
}

function assetTypeFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function lines(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function submitProofAction(formData: FormData) {
  const parsed = proofSubmissionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/proof/${encodeURIComponent(String(formData.get("token") ?? ""))}?error=invalid`);
  }

  const data = parsed.data;
  const context = data.mode === "portal" ? await getPortalProofContext(data.token) : await getProofRequestContext(data.token);
  if (!context) {
    redirect(`/proof/${encodeURIComponent(data.token)}?error=expired`);
  }
  const gate = await getServiceGate(context.tenantId, "ugc_proof_capture");
  if (!gate.enabled) {
    redirect(`/proof/${encodeURIComponent(data.token)}?error=limit`);
  }

  const headerStore = await headers();
  const ipAddress = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = headerStore.get("user-agent") ?? null;
  const title = proofTitle({
    serviceType: data.serviceType ?? context.jobTitle ?? "Completed service",
    city: data.city ?? context.location.split(",")[0] ?? "",
    state: data.state ?? "",
    customerName: data.customerName ?? context.customerName
  });

  const submissionResult = await queryPostgres<{ id: string }>(
    `
    insert into public.ugc_submissions (
      tenant_id,
      brand_id,
      customer_id,
      job_id,
      source,
      title,
      customer_name,
      customer_email,
      customer_phone,
      service_type,
      city,
      state,
      rating,
      story_text,
      result_summary,
      permission_marketing,
      permission_use_name,
      permission_use_location,
      permission_contact_followup,
      ip_address,
      user_agent,
      metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb)
    returning id
    `,
    [
      context.tenantId,
      context.brandId,
      context.customerId,
      context.jobId,
      data.mode === "portal" ? "customer_portal" : "website_form",
      title,
      data.customerName || context.customerName || null,
      data.customerEmail || context.customerEmail || null,
      data.customerPhone || context.customerPhone || null,
      data.serviceType || context.jobTitle || null,
      data.city || null,
      data.state || null,
      data.rating ?? null,
      data.storyText || null,
      data.resultSummary || null,
      data.permissionMarketing === "on",
      data.permissionUseName === "on",
      data.permissionUseLocation === "on",
      data.permissionContactFollowup === "on",
      ipAddress,
      userAgent,
      JSON.stringify({ publicTokenMode: data.mode })
    ]
  );

  const submissionId = submissionResult?.rows[0]?.id;
  if (!submissionId) {
    redirect(`/proof/${encodeURIComponent(data.token)}?error=save`);
  }

  const assetInputs = [
    ...lines(data.photoUrls).map((url) => ({ assetType: "photo", externalUrl: url })),
    ...lines(data.videoUrls).map((url) => ({ assetType: "video", externalUrl: url }))
  ];

  for (const asset of assetInputs) {
    await queryPostgres(
      `
      insert into public.ugc_assets (
        tenant_id, brand_id, submission_id, customer_id, job_id, asset_type, external_url, caption
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        context.tenantId,
        context.brandId,
        submissionId,
        context.customerId,
        context.jobId,
        asset.assetType,
        asset.externalUrl,
        title
      ]
    );
  }

  const files = formData
    .getAll("proofFiles")
    .filter((value): value is File => value instanceof File && value.size > 0)
    .slice(0, 12);
  const supabase = createSupabaseAdminClient();

  for (const [index, file] of files.entries()) {
    const mimeType = file.type || "application/octet-stream";
    if (file.size > maxUploadBytes || (!mimeType.startsWith("image/") && !mimeType.startsWith("video/"))) {
      await queryPostgres(
        `
        insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
        values ($1, $2, 'system', 'ugc_asset_upload_rejected', 'ugc_submission', $3, $4::jsonb)
        `,
        [
          context.tenantId,
          context.brandId,
          submissionId,
          JSON.stringify({ fileName: file.name, mimeType, size: file.size, reason: "unsupported_or_too_large" })
        ]
      );
      continue;
    }

    if (!supabase) {
      await queryPostgres(
        `
        insert into public.ugc_assets (
          tenant_id, brand_id, submission_id, customer_id, job_id, asset_type, original_filename, mime_type, caption, metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          context.tenantId,
          context.brandId,
          submissionId,
          context.customerId,
          context.jobId,
          assetTypeFor(mimeType),
          file.name,
          mimeType,
          title,
          JSON.stringify({ uploadStatus: "not_configured", reason: "Supabase storage admin config missing" })
        ]
      );
      continue;
    }

    const extension = safeFileName(file.name).split(".").pop();
    const storagePath = `${context.tenantId}/${submissionId}/${index + 1}-${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
    const bytes = await file.arrayBuffer();
    const upload = await supabase.storage.from(proofBucket).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false
    });

    if (upload.error) {
      await queryPostgres(
        `
        insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
        values ($1, $2, 'system', 'ugc_asset_upload_failed', 'ugc_submission', $3, $4::jsonb)
        `,
        [context.tenantId, context.brandId, submissionId, JSON.stringify({ fileName: file.name, message: upload.error.message })]
      );
      continue;
    }

    await queryPostgres(
      `
      insert into public.ugc_assets (
        tenant_id, brand_id, submission_id, customer_id, job_id, asset_type, storage_bucket, storage_path, original_filename, mime_type, caption
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        context.tenantId,
        context.brandId,
        submissionId,
        context.customerId,
        context.jobId,
        assetTypeFor(mimeType),
        proofBucket,
        storagePath,
        file.name,
        mimeType,
        title
      ]
    );
  }

  if (data.mode === "request") {
    await queryPostgres(
      "update public.ugc_capture_requests set status = 'submitted', submitted_at = now(), updated_at = now() where public_token = $1",
      [data.token]
    );
  }

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'system', 'ugc_submission_received', 'ugc_submission', $3, $4::jsonb)
    `,
    [context.tenantId, context.brandId, submissionId, JSON.stringify({ assetCount: assetInputs.length, source: data.mode })]
  );

  redirect(`/proof/${encodeURIComponent(data.token)}?success=1`);
}
