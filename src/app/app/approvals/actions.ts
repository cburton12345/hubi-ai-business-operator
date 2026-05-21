"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { requirePermission } from "@/lib/auth/require-permission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const approvalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  notes: z.string().max(1000).transform((value) => value.trim()).optional()
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
  await requirePermission("approval:review_low");

  const parsed = approvalDecisionSchema.safeParse({
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision"),
    notes: String(formData.get("notes") ?? "")
  });

  if (!parsed.success) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const approvalResult = await queryPostgres<ApprovalRecord>(
      `
      update public.approvals
      set status = $2, notes = coalesce(nullif($4, ''), notes), reviewed_at = now()
      where tenant_id = $1 and id = $3
      returning id, tenant_id, brand_id, target_type, target_id, risk_level
      `,
      [workspaceId, parsed.data.decision, parsed.data.approvalId, parsed.data.notes ?? ""]
    );
    const approval = approvalResult?.rows[0];

    if (!approval) {
      return;
    }

    if (approval.target_type === "ai_draft") {
      await queryPostgres(
        `
        update public.ai_drafts
        set status = $3, updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          approval.tenant_id,
          approval.target_id,
          parsed.data.decision === "approved" ? "approved" : parsed.data.decision === "rejected" ? "rejected" : "needs_review"
        ]
      );
    }

    if (approval.target_type === "recommendation") {
      await queryPostgres(
        `
        update public.recommendations
        set status = $3, updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          approval.tenant_id,
          approval.target_id,
          parsed.data.decision === "approved" ? "approved" : parsed.data.decision === "rejected" ? "rejected" : "open"
        ]
      );
    }

    await queryPostgres(
      `
      insert into public.activity_logs (
        tenant_id,
        brand_id,
        actor_type,
        action,
        target_type,
        target_id,
        metadata_json
      )
      values ($1, $2, 'user', $3, $4, $5, $6::jsonb)
      `,
      [
        approval.tenant_id,
        approval.brand_id,
        `approval.${parsed.data.decision}`,
        approval.target_type,
        approval.target_id,
        JSON.stringify({
          approvalId: approval.id,
          riskLevel: approval.risk_level,
          reviewNote: parsed.data.notes ?? ""
        })
      ]
    );

    revalidatePath("/app/approvals");
    revalidatePath("/app/drafts");
    revalidatePath("/app/recommendations");
    return;
  }

  const { approvalId, decision } = parsed.data;

  const { data: approval } = await supabase
    .from("approvals")
    .update({
      status: decision,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      reviewed_at: new Date().toISOString()
    })
    .eq("tenant_id", workspaceId)
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
      riskLevel: approval.risk_level,
      reviewNote: parsed.data.notes ?? ""
    }
  });

  revalidatePath("/app/approvals");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
}
