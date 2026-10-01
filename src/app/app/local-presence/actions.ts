"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { discoverBusinessProfileLocations, syncBusinessProfileReviews } from "@/lib/integrations/google-business-profile/sync";
import { syncCompletedJobLocalPresenceEvents } from "@/lib/local-presence/events";
import { executeApprovedGoogleProfileIssue, executeApprovedGoogleReviewReply, syncGoogleLocalPresence } from "@/lib/local-presence/google-sync";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const policySchema = z.object({
  authorityMode: z.enum(["suggest", "approval_required", "autopilot"]),
  useTrackedPhone: z.boolean(),
  autoPreparePosts: z.boolean(),
  autoRequestReviews: z.boolean(),
  positiveReplyOptIn: z.boolean(),
  positiveReplyMinStars: z.coerce.number().int().min(4).max(5),
  negativeReviewThreshold: z.coerce.number().int().min(1).max(3),
  negativeReviewRoute: z.enum(["owner", "service_recovery", "approval_queue"]),
  staleAfterDays: z.coerce.number().int().min(7).max(365)
});

export async function refreshLocalPresenceAction() {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  await discoverBusinessProfileLocations(tenantId);
  const selected = await queryPostgres<{ id: string }>(
    `select id from public.business_profile_locations where tenant_id=$1 and selected=true limit 1`,
    [tenantId]
  );
  if (selected?.rows[0]) {
    await syncBusinessProfileReviews(tenantId);
    await Promise.all([syncGoogleLocalPresence(tenantId), syncCompletedJobLocalPresenceEvents(tenantId)]);
  }
  revalidatePath("/app/local-presence");
  revalidatePath("/app/integrations/business-profile");
}

export async function approveAndApplyLocalProfileIssueAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const issueId = z.string().uuid().parse(formData.get("issueId"));
  await queryPostgres(
    `update public.local_presence_issues set status='approved',metadata_json=metadata_json || $3::jsonb,updated_at=now()
     where tenant_id=$1 and id=$2 and safe_to_auto_fix=true and status in ('open','recommended','needs_approval')`,
    [tenantId, issueId, JSON.stringify({ approvedByUserId: session?.userId ?? null, approvedAt: new Date().toISOString() })]
  );
  await executeApprovedGoogleProfileIssue(tenantId, issueId);
  revalidatePath("/app/local-presence");
  revalidatePath("/app/integrations/business-profile");
}

export async function saveLocalPresencePolicyAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  const parsed = policySchema.parse({
    authorityMode: formData.get("authorityMode"),
    useTrackedPhone: formData.get("useTrackedPhone") === "on",
    autoPreparePosts: formData.get("autoPreparePosts") === "on",
    autoRequestReviews: formData.get("autoRequestReviews") === "on",
    positiveReplyOptIn: formData.get("positiveReplyOptIn") === "on",
    positiveReplyMinStars: formData.get("positiveReplyMinStars"),
    negativeReviewThreshold: formData.get("negativeReviewThreshold"),
    negativeReviewRoute: formData.get("negativeReviewRoute"),
    staleAfterDays: formData.get("staleAfterDays")
  });
  const brand = await queryPostgres<{ id: string }>(`select id from public.brands where tenant_id=$1 and status='active' order by created_at limit 1`, [tenantId]);
  if (!brand?.rows[0]) throw new Error("Create an active brand first.");
  await queryPostgres(
    `insert into public.local_presence_policies
      (tenant_id,brand_id,provider_key,authority_mode,use_tracked_phone_when_appropriate,auto_prepare_posts,auto_request_reviews,
       positive_reply_opt_in,positive_reply_min_stars,negative_review_threshold,negative_review_route,stale_after_days)
     values ($1,$2,'google_business_profile',$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (tenant_id,brand_id,provider_key) do update set authority_mode=excluded.authority_mode,
       use_tracked_phone_when_appropriate=excluded.use_tracked_phone_when_appropriate,auto_prepare_posts=excluded.auto_prepare_posts,
       auto_request_reviews=excluded.auto_request_reviews,positive_reply_opt_in=excluded.positive_reply_opt_in,
       positive_reply_min_stars=excluded.positive_reply_min_stars,negative_review_threshold=excluded.negative_review_threshold,
       negative_review_route=excluded.negative_review_route,stale_after_days=excluded.stale_after_days,updated_at=now()`,
    [tenantId, brand.rows[0].id, parsed.authorityMode, parsed.useTrackedPhone, parsed.autoPreparePosts, parsed.autoRequestReviews,
      parsed.positiveReplyOptIn, parsed.positiveReplyMinStars, parsed.negativeReviewThreshold, parsed.negativeReviewRoute, parsed.staleAfterDays]
  );
  revalidatePath("/app/local-presence");
}

export async function approveLocalReviewReplyAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await queryPostgres(
    `update public.local_presence_review_actions set status='approved',approved_by_user_id=$3,approved_at=now(),updated_at=now()
     where tenant_id=$1 and id=$2 and status in ('draft','needs_approval','failed')`,
    [tenantId, actionId, session?.userId ?? null]
  );
  revalidatePath("/app/local-presence");
}

export async function publishApprovedLocalReviewReplyAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const tenantId = await getCurrentWorkspaceId();
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await executeApprovedGoogleReviewReply(tenantId, actionId);
  revalidatePath("/app/local-presence");
  revalidatePath("/app/integrations/business-profile");
}
