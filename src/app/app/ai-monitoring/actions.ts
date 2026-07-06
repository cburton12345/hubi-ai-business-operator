"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { generateDailyOwnerBriefing, ensureDefaultMonitorSetup } from "@/lib/ai-monitoring/get-ai-monitoring-center";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function generateDailyOwnerBriefingAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  await ensureDefaultMonitorSetup(workspaceId);
  const gate = await getServiceGate(workspaceId, "ai_monitoring_briefing");

  if (!gate.enabled) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, event_family, event_type, title, body, metadata_json
      )
      values ($1, 'system', 'service_control_blocked', 'Daily owner brief blocked', $2, $3::jsonb)
      `,
      [
        workspaceId,
        gate.reason,
        JSON.stringify({
          featureKey: gate.featureKey,
          mode: gate.mode,
          currentUsage: gate.currentUsage,
          usageLimit: gate.usageLimit
        })
      ]
    );
  } else {
    await generateDailyOwnerBriefing(workspaceId);
  }

  revalidatePath("/app/ai-monitoring");
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/attention-command");
}
