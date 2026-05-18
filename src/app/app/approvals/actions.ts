"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const approvalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected", "changes_requested"])
});

type ApprovalRecord = {
  id: string;
  tenant_id: string;
  brand_id: string;
  target_type: string;
  target_id: string;
  risk_level: string;
};

export async function decideApproval(formData: FormData) {
  const parsed = approvalDecisionSchema.safeParse({
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision")
  });

  if (!parsed.success) {
    return;
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const { approvalId, decision } = parsed.data;

  const { data: approval } = await supabase
    .from("approvals")
    .update({
      status: decision,
      reviewed_at: new Date().toISOString()
    })
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
    .eq("id", approvalId)
    .select("id, tenant_id, brand_id, target_type, target_id, risk_level")
    .single<ApprovalRecord>();

  if (!approval) {
    return;
  }

  if (approval.target_type === "ai_draft") {
    await supabase
      .from("ai_drafts")
      .update({
        status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "needs_review",
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", approval.tenant_id)
      .eq("id", approval.target_id);
  }

  if (approval.target_type === "recommendation") {
    await supabase
      .from("recommendations")
      .update({
        status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "open",
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", approval.tenant_id)
      .eq("id", approval.target_id);
  }

  await supabase.from("activity_logs").insert({
    tenant_id: approval.tenant_id,
    brand_id: approval.brand_id,
    actor_type: "user",
    action: `approval.${decision}`,
    target_type: approval.target_type,
    target_id: approval.target_id,
    metadata_json: {
      approvalId: approval.id,
      riskLevel: approval.risk_level
    }
  });

  revalidatePath("/app/approvals");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
}
