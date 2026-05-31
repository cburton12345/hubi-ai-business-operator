"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { makePublicToken } from "@/lib/ugc/proof";

const statusSchema = z.object({
  submissionId: z.string().uuid(),
  status: z.enum(["needs_review", "approved", "needs_edit", "rejected", "archived"]),
  notes: z.string().trim().max(1000).optional()
});

const requestSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().or(z.literal("")),
  requestType: z.enum(["job_proof", "review_proof", "testimonial", "before_after", "general"]).default("job_proof")
});

const draftSchema = z.object({
  submissionId: z.string().uuid()
});

const assetSchema = z.object({
  assetId: z.string().uuid(),
  status: z.enum(["needs_review", "approved", "rejected", "archived"]),
  beforeAfter: z.enum(["before", "during", "after", "result", "other"]).default("other"),
  caption: z.string().trim().max(500).optional()
});

export async function updateProofSubmissionAction(formData: FormData) {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);

  await queryPostgres(
    `
    update public.ugc_submissions
    set status = $3,
        reviewer_notes = $4,
        reviewed_by_user_id = $5,
        reviewed_at = now(),
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.submissionId, parsed.data.status, parsed.data.notes || null, session?.userId ?? null]
  );

  await queryPostgres(
    `
    update public.ugc_assets
    set status = case when $3 = 'approved' then 'approved' when $3 in ('rejected','archived') then $3 else status end,
        updated_at = now()
    where tenant_id = $1 and submission_id = $2
    `,
    [workspaceId, parsed.data.submissionId, parsed.data.status]
  );

  revalidatePath("/app/proof");
  revalidatePath("/app/review");
}

export async function createProofRequestAction(formData: FormData) {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const customerResult = await queryPostgres<{ brand_id: string | null }>(
    "select brand_id from public.customers where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, parsed.data.customerId]
  );
  const brandId = customerResult?.rows[0]?.brand_id ?? null;
  const token = makePublicToken();

  await queryPostgres(
    `
    insert into public.ugc_capture_requests (
      tenant_id, brand_id, customer_id, job_id, public_token, request_type, status, created_by_user_id, metadata_json
    )
    values ($1, $2, $3, nullif($4, '')::uuid, $5, $6, 'ready', $7, $8::jsonb)
    on conflict (public_token) do nothing
    `,
    [
      workspaceId,
      brandId,
      parsed.data.customerId,
      parsed.data.jobId || "",
      token,
      parsed.data.requestType,
      session?.userId ?? null,
      JSON.stringify({ createdFrom: "proof_dashboard" })
    ]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, user_id, actor_type, action, target_type, metadata_json)
    values ($1, $2, $3, 'user', 'ugc_capture_request_created', 'ugc_capture_request', $4::jsonb)
    `,
    [workspaceId, brandId, session?.userId ?? null, JSON.stringify({ publicUrl: `/proof/${token}` })]
  );

  revalidatePath("/app/proof");
}

export async function updateProofAssetAction(formData: FormData) {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.ugc_assets
    set status = $3,
        before_after = $4,
        caption = $5,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.assetId,
      parsed.data.status,
      parsed.data.beforeAfter,
      parsed.data.caption || null
    ]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, 'user', 'ugc_asset_reviewed', 'ugc_asset', $2, $3::jsonb)
    `,
    [
      workspaceId,
      parsed.data.assetId,
      JSON.stringify({ status: parsed.data.status, beforeAfter: parsed.data.beforeAfter })
    ]
  );

  revalidatePath("/app/proof");
}

function outputBody(kind: string, proof: {
  title: string | null;
  customerName: string | null;
  serviceType: string | null;
  city: string | null;
  state: string | null;
  storyText: string | null;
  resultSummary: string | null;
  rating: number | null;
}) {
  const location = [proof.city, proof.state].filter(Boolean).join(", ");
  const service = proof.serviceType || proof.title || "completed service";
  const customer = proof.customerName || "a customer";
  const story = proof.storyText || proof.resultSummary || "Customer proof was submitted and is ready for review.";

  if (kind === "gbp_post") {
    return `Draft Google Business Profile post:\n\nRecent ${service}${location ? ` in ${location}` : ""}. ${story}\n\nReview photos, consent, and any claims before publishing.`;
  }

  if (kind === "facebook_post") {
    return `Draft Facebook post:\n\nAnother completed ${service}${location ? ` in ${location}` : ""}. ${story}\n\nAdd approved before/after photos before posting.`;
  }

  if (kind === "city_page") {
    return `Draft local SEO page outline:\n\nTitle: ${service}${location ? ` in ${location}` : ""}\n\nUse this customer proof as supporting evidence after approval.\n\nSections:\n- The problem or project\n- Work completed\n- Result\n- Approved customer quote\n- Service area CTA\n\nDo not publish until details, consent, and quality review pass.`;
  }

  if (kind === "facebook_ad") {
    return `Draft ad creative:\n\nHook: Need help with ${service}${location ? ` in ${location}` : ""}?\nProof angle: Real customer result from ${customer}.\nBody: ${story}\nCTA: Request a quote.\n\nConfirm claims, permissions, offer, and ad account policy before use.`;
  }

  return `Approved testimonial card draft:\n\n"${story}"\n\nAttribution: ${customer}${location ? `, ${location}` : ""}\n\nUse only if name/location permission is approved.`;
}

export async function prepareProofContentDraftsAction(formData: FormData) {
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const proofResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string | null;
    title: string | null;
    customer_name: string | null;
    service_type: string | null;
    city: string | null;
    state: string | null;
    story_text: string | null;
    result_summary: string | null;
    rating: number | null;
    permission_marketing: boolean;
    permission_use_name: boolean;
    permission_use_location: boolean;
  }>(
    `
    select *
    from public.ugc_submissions
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.submissionId]
  );

  const proof = proofResult?.rows[0];
  if (!proof?.brand_id || !proof.permission_marketing) {
    revalidatePath("/app/proof");
    return;
  }

  const outputs = [
    { outputType: "gbp_post", contentType: "gbp_post", title: `GBP proof post: ${proof.title || "Customer proof"}` },
    { outputType: "facebook_post", contentType: "facebook_post", title: `Facebook proof post: ${proof.title || "Customer proof"}` },
    { outputType: "seo_page", contentType: "city_page", title: `SEO proof page: ${proof.title || "Customer proof"}` },
    { outputType: "ad_creative", contentType: "facebook_ad", title: `Ad proof angle: ${proof.title || "Customer proof"}` }
  ];

  for (const output of outputs) {
    const draftResult = await queryPostgres<{ id: string }>(
      `
      insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level)
      values ($1, $2, $3, $4, $5, $6::jsonb, 'needs_review', 'medium')
      returning id
      `,
      [
        workspaceId,
        proof.brand_id,
        output.contentType,
        output.title,
        outputBody(output.outputType, {
          title: proof.title,
          customerName: proof.customer_name,
          serviceType: proof.service_type,
          city: proof.city,
          state: proof.state,
          storyText: proof.story_text,
          resultSummary: proof.result_summary,
          rating: proof.rating
        }),
        JSON.stringify({
          source: "ugc_proof",
          submissionId: proof.id,
          consent: {
            marketing: proof.permission_marketing,
            useName: proof.permission_use_name,
            useLocation: proof.permission_use_location
          }
        })
      ]
    );

    const draftId = draftResult?.rows[0]?.id ?? null;
    await queryPostgres(
      `
      insert into public.ugc_content_outputs (tenant_id, brand_id, submission_id, ai_draft_id, output_type, status, title, summary, metadata_json)
      values ($1, $2, $3, $4, $5, 'needs_review', $6, $7, $8::jsonb)
      `,
      [
        workspaceId,
        proof.brand_id,
        proof.id,
        draftId,
        output.outputType,
        output.title,
        "Prepared from approved customer proof. Review before public use.",
        JSON.stringify({ generatedWithoutLivePublishing: true })
      ]
    );
  }

  revalidatePath("/app/proof");
  revalidatePath("/app/review");
}
