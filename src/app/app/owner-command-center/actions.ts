"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { syncTimelineToOwnerCommandCenter } from "@/lib/owner-command-center/sync-owner-command-events";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const eventActionSchema = z.object({
  eventId: z.string().uuid(),
  nextStatus: z.enum(["watching", "ai_handled", "resolved"])
});

const capabilityTrustSchema = z.object({
  capabilityKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  nextLevel: z.enum(["unverified", "observing", "assisted", "trusted", "autonomous"])
});

const capabilityPauseSchema = z.object({
  capabilityKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  paused: z.enum(["true", "false"])
});

const trustOrder = ["unverified", "observing", "assisted", "trusted", "autonomous"] as const;

function actionCopy(status: string) {
  if (status === "ai_handled") {
    return {
      title: "Owner event marked AI handled",
      body: "The owner command event was marked handled by AI or automation review."
    };
  }
  if (status === "resolved") {
    return {
      title: "Owner event resolved",
      body: "The owner command event was resolved from the command center."
    };
  }
  return {
    title: "Owner event moved to watching",
    body: "The owner command event remains visible but no immediate owner decision is required."
  };
}

export async function updateOwnerCommandEventAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = eventActionSchema.safeParse({
    eventId: formData.get("eventId"),
    nextStatus: formData.get("nextStatus")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const nextStatus = parsed.data.nextStatus;
  const copy = actionCopy(nextStatus);

  const result = await queryPostgres<{ id: string; title: string; platform_name: string }>(
    `
    update public.owner_command_events
    set status = $3,
      owner_attention = case when $3 in ('resolved', 'ai_handled', 'watching') then false else owner_attention end,
      ai_handled = case when $3 = 'ai_handled' then true else ai_handled end,
      ai_summary = case when $3 = 'ai_handled' then coalesce(ai_summary, 'Marked handled from Owner Events.') else ai_summary end,
      metadata_json = metadata_json || $4::jsonb,
      updated_at = now()
    where tenant_id = $1 and id = $2
    returning id, title, platform_name
    `,
    [
      workspaceId,
      parsed.data.eventId,
      nextStatus,
      JSON.stringify({
        lastOwnerAction: nextStatus,
        lastOwnerActionAt: new Date().toISOString(),
        lastOwnerActionBy: session?.email ?? "admin-token"
      })
    ]
  );

  const event = result?.rows[0];
  if (event) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, event_family, event_type, title, body, primary_entity_type, primary_entity_id,
        source_table, source_id, metadata_json
      )
      values ($1, 'system', 'owner_command_action', $2, $3, 'owner_command_event', $4::uuid, 'owner_command_events', $4::uuid, $5::jsonb)
      `,
      [
        workspaceId,
        copy.title,
        `${copy.body} Event: ${event.title}. Platform: ${event.platform_name}.`,
        event.id,
        JSON.stringify({ status: nextStatus, actor: session?.email ?? "admin-token" })
      ]
    );
  }

  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/reports");
}

export async function syncFerocityActivityToOwnerCommandAction() {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const result = await syncTimelineToOwnerCommandCenter(workspaceId);

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, metadata_json
    )
    values ($1, 'system', 'owner_command_sync', $2, $3, $4::jsonb)
    `,
    [
      workspaceId,
      "Owner Events synced Ferocity activity",
      `Scanned ${result.scanned} timeline events and promoted ${result.promoted} owner-visible events.`,
      JSON.stringify({
        scanned: result.scanned,
        promoted: result.promoted,
        actor: session?.email ?? "admin-token"
      })
    ]
  );

  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/operator");
  revalidatePath("/app/reports");
}

export async function updateCapabilityTrustAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = capabilityTrustSchema.safeParse({ capabilityKey: formData.get("capabilityKey"), nextLevel: formData.get("nextLevel") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  if (!session?.userId) return;
  const roleResult = await queryPostgres<{ role: string }>(
    `select role from public.tenant_users where tenant_id=$1 and user_id=$2 and status='active' limit 1`,
    [workspaceId, session.userId]
  );
  if (roleResult?.rows[0]?.role !== "owner" && session.platformRole !== "super_admin") return;

  const currentResult = await queryPostgres<{ trust_level: (typeof trustOrder)[number]; recommended_trust_level: (typeof trustOrder)[number]; health_state: string }>(
    `select trust_level, recommended_trust_level, health_state from public.capability_trust_profiles
     where tenant_id=$1 and capability_key=$2 limit 1`,
    [workspaceId, parsed.data.capabilityKey]
  );
  const current = currentResult?.rows[0];
  if (!current) return;
  const currentIndex = trustOrder.indexOf(current.trust_level);
  const nextIndex = trustOrder.indexOf(parsed.data.nextLevel);
  const recommendedIndex = trustOrder.indexOf(current.recommended_trust_level);
  const promotion = nextIndex > currentIndex;
  if (promotion && (nextIndex !== currentIndex + 1 || nextIndex > recommendedIndex || current.health_state !== "healthy")) return;

  await Promise.all([
    queryPostgres(
      `update public.capability_trust_profiles set trust_level=$3,
         promoted_by_user_id=case when $4 then $5 else promoted_by_user_id end,
         promoted_at=case when $4 then now() else promoted_at end,
         metadata_json=metadata_json || $6::jsonb, updated_at=now()
       where tenant_id=$1 and capability_key=$2`,
      [workspaceId, parsed.data.capabilityKey, parsed.data.nextLevel, promotion, session.userId, JSON.stringify({ lastTrustDecisionBy: session.email, lastTrustDecisionAt: new Date().toISOString() })]
    ),
    queryPostgres(
      `insert into public.operator_timeline_events (
         tenant_id, event_family, event_type, title, body, metadata_json
       ) values ($1,'system','capability_trust_changed','Capability trust changed',$2,$3::jsonb)`,
      [workspaceId, `${parsed.data.capabilityKey.replaceAll("_", " ")} changed from ${current.trust_level} to ${parsed.data.nextLevel}.`, JSON.stringify({ capabilityKey: parsed.data.capabilityKey, from: current.trust_level, to: parsed.data.nextLevel, actorUserId: session.userId })]
    )
  ]);
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/ai-workforce");
}

export async function setCapabilityEmergencyPauseAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = capabilityPauseSchema.safeParse({ capabilityKey: formData.get("capabilityKey"), paused: formData.get("paused") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const paused = parsed.data.paused === "true";
  await Promise.all([
    queryPostgres(
      `update public.capability_trust_profiles set emergency_paused=$3,
         metadata_json=metadata_json || $4::jsonb, updated_at=now()
       where tenant_id=$1 and capability_key=$2`,
      [workspaceId, parsed.data.capabilityKey, paused, JSON.stringify({ emergencyPauseChangedBy: session?.userId ?? null, emergencyPauseChangedAt: new Date().toISOString() })]
    ),
    queryPostgres(
      `insert into public.operator_timeline_events (
         tenant_id, event_family, event_type, title, body, metadata_json
       ) values ($1,'system','capability_emergency_pause',$2,$3,$4::jsonb)`,
      [workspaceId, paused ? "Capability emergency pause enabled" : "Capability emergency pause cleared", `${parsed.data.capabilityKey.replaceAll("_", " ")} was ${paused ? "paused" : "resumed"}.`, JSON.stringify({ capabilityKey: parsed.data.capabilityKey, paused, actorUserId: session?.userId ?? null })]
    )
  ]);
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/ai-workforce");
}
