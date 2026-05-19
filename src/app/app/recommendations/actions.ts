"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const recommendationDecisionSchema = z.object({
  recommendationId: z.string().min(1),
  status: z.enum(["approved", "rejected", "completed", "archived"])
});

export async function updateRecommendationStatus(formData: FormData) {
  const parsed = recommendationDecisionSchema.safeParse({
    recommendationId: formData.get("recommendationId"),
    status: formData.get("status")
  });

  if (!parsed.success) {
    return;
  }

  const { recommendationId, status } = parsed.data;
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const result = await queryPostgres<{ tenant_id: string; brand_id: string }>(
      `
      update public.recommendations
      set status = $3, updated_at = now()
      where tenant_id = $1 and id = $2
      returning tenant_id, brand_id
      `,
      ["11111111-1111-4111-8111-111111111111", recommendationId, status]
    );
    const recommendation = result?.rows[0];

    if (recommendation) {
      await queryPostgres(
        `
        insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
        values ($1, $2, 'user', $3, 'recommendation', $4, $5::jsonb)
        `,
        [
          recommendation.tenant_id,
          recommendation.brand_id,
          `recommendation.${status}`,
          recommendationId,
          JSON.stringify({ status })
        ]
      );
    }

    revalidatePath("/app/recommendations");
    revalidatePath("/app/approvals");
    return;
  }

  const { data } = await supabase
    .from("recommendations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
    .eq("id", recommendationId)
    .select("tenant_id, brand_id")
    .single<{ tenant_id: string; brand_id: string }>();

  if (data) {
    await supabase.from("activity_logs").insert({
      tenant_id: data.tenant_id,
      brand_id: data.brand_id,
      actor_type: "user",
      action: `recommendation.${status}`,
      target_type: "recommendation",
      target_id: recommendationId,
      metadata_json: { status }
    });
  }

  revalidatePath("/app/recommendations");
  revalidatePath("/app/approvals");
}
