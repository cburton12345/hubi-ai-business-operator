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
      ai_summary = case when $3 = 'ai_handled' then coalesce(ai_summary, 'Marked handled from the Owner Feed.') else ai_summary end,
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
      "Owner Feed synced Ferocity activity",
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
