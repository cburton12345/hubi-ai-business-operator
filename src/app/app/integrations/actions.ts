"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const integrationToggleSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["planned", "paused", "connected"]),
  liveActionsEnabled: z.enum(["false", "true"]).default("false")
});

export async function updateIntegrationReadinessAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = integrationToggleSchema.safeParse({
    connectionId: formData.get("connectionId"),
    status: formData.get("status"),
    liveActionsEnabled: formData.get("liveActionsEnabled") ?? "false"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.integration_connections
    set status = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      parsed.data.status,
      JSON.stringify({
        liveActionsEnabled: parsed.data.liveActionsEnabled === "true",
        manuallyReviewedAt: new Date().toISOString()
      })
    ]
  );

  revalidatePath("/app/integrations");
  revalidatePath("/app/credentials");
}
