"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  checkId: z.string().uuid(),
  status: z.enum(["pending", "passed", "failed", "waived"]),
  notes: z.string().max(1000).optional()
});

export async function updateBetaCheckAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse({
    checkId: formData.get("checkId"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  await queryPostgres(
    `
    update public.beta_launch_checks
    set status = $3, notes = $4, updated_by_user_id = $5, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.checkId, parsed.data.status, parsed.data.notes ?? "", session?.userId ?? null]
  );
  revalidatePath("/app/beta");
}
