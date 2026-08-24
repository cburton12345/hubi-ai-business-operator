"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { requirePermission } from "@/lib/auth/require-permission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getCurrentAppSession } from "@/lib/auth/session";
import { recordGrowthEvent, type GrowthEventType } from "@/lib/growth/growth-events";

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

async function recordGrowthApprovalDecision(tenantId: string, actionId: string, decision: "approved" | "rejected" | "changes_requested", notes?: string) {
  const context = await queryPostgres<{
    brand_id: string | null; objective_id: string | null; identity_id: string | null; community_id: string | null;
    opportunity_id: string | null; channel_key: string; action_key: string;
  }>(`
    select brand_id, objective_id, identity_id, community_id, opportunity_id, channel_key, action_key
    from public.growth_action_attempts where tenant_id = $1 and id = $2
  `, [tenantId, actionId]);
  const row = context?.rows[0];
  if (!row) return;
  const eventType: GrowthEventType = decision === "approved" ? "owner_approved" : decision === "rejected" ? "owner_rejected" : "owner_modified";
  await recordGrowthEvent({ tenantId, brandId: row.brand_id, objectiveId: row.objective_id, identityId: row.identity_id,
    communityId: row.community_id, opportunityId: row.opportunity_id, actionAttemptId: actionId, eventType,
    channelKey: row.channel_key, actionType: row.action_key, automationMode: "approve", outcome: decision,
    ownerIntervention: notes || decision, idempotencyKey: `growth-approval-decision:${actionId}:${decision}` });
}

export async function decideApproval(formData: FormData) {
  await requirePermission("approval:review_low");
  const session = await getCurrentAppSession();

  const parsed = approvalDecisionSchema.safeParse({
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision"),
    notes: String(formData.get("notes") ?? "")
  });

  if (!parsed.success) {
    return;
  }

  const workspaceId = await getCurrentWorkspaceId();
  const preflight = await queryPostgres<{ risk_level: "low" | "medium" | "high" }>(
    `select risk_level from public.approvals where tenant_id = $1 and id = $2 and status = 'pending'`,
    [workspaceId, parsed.data.approvalId]
  );
  const riskLevel = preflight?.rows[0]?.risk_level;
  if (!riskLevel) return;
  await requirePermission(riskLevel === "high" ? "approval:review_high" : riskLevel === "medium" ? "approval:review_medium" : "approval:review_low");

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const approvalResult = await queryPostgres<ApprovalRecord>(
      `
      update public.approvals
      set status = $2, notes = coalesce(nullif($4, ''), notes), reviewed_by_user_id = $5, reviewed_at = now()
      where tenant_id = $1 and id = $3
      returning id, tenant_id, brand_id, target_type, target_id, risk_level
      `,
      [workspaceId, parsed.data.decision, parsed.data.approvalId, parsed.data.notes ?? "", session?.userId ?? null]
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

    if (approval.target_type === "growth_action") {
      const actionStatus = parsed.data.decision === "approved" ? "approved" : parsed.data.decision === "rejected" ? "canceled" : "needs_approval";
      const queueStatus = parsed.data.decision === "approved" ? "approved" : parsed.data.decision === "rejected" ? "canceled" : "needs_review";
      await queryPostgres(
        `
        with updated_action as (
          update public.growth_action_attempts
          set status = $3
          where tenant_id = $1 and id = $2
          returning queue_id
        )
        update public.outbound_action_queue q
        set status = $4,
            approved_by_user_id = case when $4 = 'approved' then $5 else approved_by_user_id end,
            approved_at = case when $4 = 'approved' then now() else approved_at end,
            updated_at = now()
        from updated_action a where q.tenant_id = $1 and q.id = a.queue_id
        `,
        [approval.tenant_id, approval.target_id, actionStatus, queueStatus, session?.userId ?? null]
      );
      await recordGrowthApprovalDecision(approval.tenant_id, approval.target_id, parsed.data.decision, parsed.data.notes);
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
      reviewed_by_user_id: session?.userId ?? null,
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

  if (approval.target_type === "growth_action") {
    const actionStatus = decision === "approved" ? "approved" : decision === "rejected" ? "canceled" : "needs_approval";
    const queueStatus = decision === "approved" ? "approved" : decision === "rejected" ? "canceled" : "needs_review";
    const { data: action } = await supabase
      .from("growth_action_attempts")
      .update({ status: actionStatus })
      .eq("tenant_id", approval.tenant_id)
      .eq("id", approval.target_id)
      .select("queue_id")
      .single<{ queue_id: string | null }>();
    if (action?.queue_id) {
      await supabase
        .from("outbound_action_queue")
        .update({
          status: queueStatus,
          ...(decision === "approved" ? { approved_by_user_id: session?.userId ?? null, approved_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString()
        })
        .eq("tenant_id", approval.tenant_id)
        .eq("id", action.queue_id);
    }
    await recordGrowthApprovalDecision(approval.tenant_id, approval.target_id, decision, parsed.data.notes);
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
