"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { runAgentWorkflow, updateAgentWorkflow } from "@/lib/ai-workforce/agent-workflows";

const workflowUpdateSchema = z.object({
  workflowId: z.string().uuid(),
  status: z.enum(["active", "paused", "draft"]),
  runMode: z.enum(["draft_only", "approval_required", "auto_allowed"]),
  cadenceKey: z.enum(["manual", "every_15_min", "hourly", "daily", "weekly"])
});

const workflowRunSchema = z.object({
  agentKey: z.enum(["lead_response_agent", "follow_up_agent", "review_agent", "invoice_reminder_agent", "seo_marketing_agent", "estimator_agent", "authority_manager"])
});

export async function updateAiAgentWorkflowAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = workflowUpdateSchema.safeParse({
    workflowId: formData.get("workflowId"),
    status: formData.get("status"),
    runMode: formData.get("runMode"),
    cadenceKey: formData.get("cadenceKey")
  });
  if (!parsed.success) return;

  await updateAgentWorkflow(parsed.data);
  revalidatePath("/app/ai-workforce");
}

export async function runAiAgentWorkflowAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = workflowRunSchema.safeParse({
    agentKey: formData.get("agentKey")
  });
  if (!parsed.success) return;

  await runAgentWorkflow(parsed.data.agentKey);
  revalidatePath("/app/ai-workforce");
  revalidatePath("/app/actions");
  revalidatePath("/app/operator");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/reports");
  revalidatePath("/app/authority");
}
