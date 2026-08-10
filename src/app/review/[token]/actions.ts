"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { getReviewRequestContext } from "@/lib/reviews/review-destinations";
import { consumeLoginRateLimit } from "@/lib/security/rate-limit";

const reviewFeedbackSchema = z.object({
  token: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  feedback: z.string().trim().max(4000).optional()
});

export async function submitReviewFeedbackAction(formData: FormData) {
  const parsed = reviewFeedbackSchema.safeParse(Object.fromEntries(formData));
  const token = String(formData.get("token") ?? "");
  if (!parsed.success) redirect(`/review/${encodeURIComponent(token)}?error=invalid`);

  const context = await getReviewRequestContext(parsed.data.token);
  if (!context) redirect(`/review/${encodeURIComponent(parsed.data.token)}?error=expired`);

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = await consumeLoginRateLimit({
    scope: "public-review-feedback",
    identifier: `${parsed.data.token}:${ip}`,
    clientHint: requestHeaders.get("user-agent") ?? "",
    limit: 5,
    windowSeconds: 60 * 60
  });
  if (!rate.allowed) redirect(`/review/${encodeURIComponent(parsed.data.token)}?error=limit`);

  const needsRecovery = parsed.data.rating <= 3;
  await queryPostgres(
    `
    update public.review_request_workflows
    set rating_received = $3,
        feedback_text = $4,
        feedback_received_at = now(),
        status = 'completed',
        negative_interception_status = case
          when $3 <= 3 then 'needs_service_recovery'
          else negative_interception_status
        end,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      context.tenantId,
      context.id,
      parsed.data.rating,
      parsed.data.feedback || null,
      JSON.stringify({
        publicFeedbackReceived: true,
        needsServiceRecovery: needsRecovery,
        reviewChoicesWereNotGated: true
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (
      tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json
    )
    values ($1, $2, 'system', $3, 'review_request_workflow', $4, $5::jsonb)
    `,
    [
      context.tenantId,
      context.brandId,
      needsRecovery ? "review_feedback_needs_service_recovery" : "review_feedback_received",
      context.id,
      JSON.stringify({ rating: parsed.data.rating, privateFeedback: true, initiatedBy: "customer" })
    ]
  );

  redirect(`/review/${encodeURIComponent(parsed.data.token)}?sent=1`);
}
