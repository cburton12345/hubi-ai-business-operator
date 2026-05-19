"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  workflowId: z.string().uuid(),
  workflowJson: z.string().min(2),
  active: z.enum(["on", "off"]).optional()
});

export async function updateBusinessWorkflowAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse({
    workflowId: formData.get("workflowId"),
    workflowJson: formData.get("workflowJson"),
    active: formData.get("active") ? "on" : "off"
  });
  if (!parsed.success) return;

  let workflow: unknown;
  try {
    workflow = JSON.parse(parsed.data.workflowJson);
  } catch {
    return;
  }

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    "update public.business_workflow_configs set workflow_json = $3::jsonb, active = $4, updated_at = now() where tenant_id = $1 and id = $2",
    [workspaceId, parsed.data.workflowId, JSON.stringify(workflow), parsed.data.active === "on"]
  );
  revalidatePath("/app/workflows");
}
