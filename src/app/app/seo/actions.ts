"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { generateSeoAutopilotDrafts } from "@/lib/seo/seo-autopilot";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function generateSeoAutopilotAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const gate = await getServiceGate(workspaceId, "seo_autopilot");
  if (!gate.enabled) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id,
        event_family,
        event_type,
        title,
        body,
        metadata_json
      )
      values ($1, 'system', 'service_control_blocked', 'SEO autopilot blocked', $2, $3::jsonb)
      `,
      [workspaceId, gate.reason, JSON.stringify({ featureKey: "seo_autopilot", mode: gate.mode, currentUsage: gate.currentUsage, usageLimit: gate.usageLimit })]
    );
  } else {
    await generateSeoAutopilotDrafts(workspaceId);
  }

  revalidatePath("/app");
  revalidatePath("/app/seo");
  revalidatePath("/app/calendar");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
}
