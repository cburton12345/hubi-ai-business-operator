"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { makePublicToken } from "@/lib/ugc/proof";
import { prepareProofContentDrafts } from "@/lib/ugc/prepare-proof-content";

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

export async function prepareProofContentDraftsAction(formData: FormData) {
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await prepareProofContentDrafts({ tenantId: workspaceId, submissionId: parsed.data.submissionId, limit: 1 });

  revalidatePath("/app/proof");
  revalidatePath("/app/review");
}
