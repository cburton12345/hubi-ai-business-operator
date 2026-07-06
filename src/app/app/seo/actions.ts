"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { activateSeoTrafficEngine, generateSeoAutopilotDrafts } from "@/lib/seo/seo-autopilot";
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

export async function activateSeoTrafficEngineAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const gates = await Promise.all([
    getServiceGate(workspaceId, "seo_autopilot"),
    getServiceGate(workspaceId, "ai_search_visibility"),
    getServiceGate(workspaceId, "seo_content_strategy"),
    getServiceGate(workspaceId, "authority_builder"),
    getServiceGate(workspaceId, "cms_publishing_connections")
  ]);
  const blocked = gates.find((gate) => !gate.enabled);

  if (blocked) {
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
      values ($1, 'system', 'service_control_blocked', 'SEO/GEO engine blocked', $2, $3::jsonb)
      `,
      [
        workspaceId,
        blocked.reason,
        JSON.stringify({
          featureKey: blocked.featureKey,
          mode: blocked.mode,
          currentUsage: blocked.currentUsage,
          usageLimit: blocked.usageLimit
        })
      ]
    );
  } else {
    await activateSeoTrafficEngine(workspaceId);
  }

  revalidatePath("/app");
  revalidatePath("/app/seo");
  revalidatePath("/app/publishing-hub");
  revalidatePath("/app/growth-calendar");
  revalidatePath("/app/review");
  revalidatePath("/app/drafts");
  revalidatePath("/app/recommendations");
}
