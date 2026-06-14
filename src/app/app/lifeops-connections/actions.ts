"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const updateSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["planned", "connected", "paused", "needs_attention"])
});

export async function updateLifeOpsConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = updateSchema.safeParse({
    connectionId: formData.get("connectionId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.owner_platform_connections
    set connection_status = $3,
        metadata_json = metadata_json || $4::jsonb
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      parsed.data.status,
      JSON.stringify({ manuallyReviewedAt: new Date().toISOString() })
    ]
  );

  revalidatePath("/app/lifeops-connections");
  revalidatePath("/app/owner-command-center");
}
