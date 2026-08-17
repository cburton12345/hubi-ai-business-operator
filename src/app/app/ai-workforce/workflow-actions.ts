"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { runAgentWorkflow, updateAgentWorkflow } from "@/lib/ai-workforce/agent-workflows";

const workflowUpdateSchema = z.object({
  workflowId: z.string().uuid(),
  status: z.enum(["active", "paused", "draft"]),
  runMode: z.enum(["draft_only", "approval_required", "auto_allowed"]),
  cadenceKey: z.enum(["manual", "every_15_min", "hourly", "daily", "weekly"]),
  agentName: z.string().trim().min(2).max(100),
  plainGoal: z.string().trim().min(10).max(1200),
  tone: z.string().trim().min(2).max(300),
  customInstructions: z.string().trim().max(3000),
  knowledgeFocus: z.string().trim().max(1800),
  escalationRules: z.string().trim().max(1800),
  successMeasures: z.string().trim().max(1800),
  authoritySummary: z.string().trim().max(1800)
});

const workflowRunSchema = z.object({
  agentKey: z.enum(["lead_response_agent", "follow_up_agent", "customer_lifecycle_agent", "dispatcher_agent", "review_agent", "invoice_reminder_agent", "seo_marketing_agent", "estimator_agent", "authority_manager"])
});

export async function updateAiAgentWorkflowAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = workflowUpdateSchema.safeParse({
    workflowId: formData.get("workflowId"),
    status: formData.get("status"),
    runMode: formData.get("runMode"),
    cadenceKey: formData.get("cadenceKey"),
    agentName: formData.get("agentName"),
    plainGoal: formData.get("plainGoal"),
    tone: formData.get("tone"),
    customInstructions: formData.get("customInstructions"),
    knowledgeFocus: formData.get("knowledgeFocus"),
    escalationRules: formData.get("escalationRules"),
    successMeasures: formData.get("successMeasures"),
    authoritySummary: formData.get("authoritySummary")
  });
  if (!parsed.success) return;

  const enabledChannels = ["in_app", "voice", "website_chat", "sms", "email"]
    .filter((channel) => formData.get(`channel:${channel}`) === "on");
  await updateAgentWorkflow({ ...parsed.data, enabledChannels: enabledChannels.length ? enabledChannels : ["in_app"] });
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
