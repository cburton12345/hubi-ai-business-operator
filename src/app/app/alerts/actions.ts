"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { runWorkspaceAlertScan } from "@/lib/alerts/run-alert-scan";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const alertActionSchema = z.object({
  alertId: z.string().uuid()
});

export async function refreshOperatorAlertsAction() {
  await requirePermission("lead:manage");
  await runWorkspaceAlertScan();
  revalidatePath("/app/alerts");
  revalidatePath("/app/reports");
}

export async function resolveOperatorAlertAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = alertActionSchema.safeParse({ alertId: formData.get("alertId") });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  await queryPostgres(
    `
    update public.operator_alerts
    set status = 'resolved',
        resolved_at = now(),
        resolved_by_user_id = $3,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.alertId, session?.userId ?? null]
  );

  revalidatePath("/app/alerts");
  revalidatePath("/app/reports");
}
