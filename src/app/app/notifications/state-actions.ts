"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  source: z.enum(["owner_event", "ai_work", "approval", "provider_request", "funding_alert", "marketing_recommendation"]),
  sourceId: z.string().uuid(),
  status: z.enum(["read", "acknowledged", "snoozed", "cleared"]),
  snoozedUntil: z.string().datetime({ offset: true }).optional()
});

export async function updateInAppNotificationStateAction(formData: FormData) {
  await requirePermission("tenant:view");
  const parsed = schema.safeParse({
    source: formData.get("source"),
    sourceId: formData.get("sourceId"),
    status: formData.get("status"),
    snoozedUntil: String(formData.get("snoozedUntil") ?? "") || undefined
  });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session?.userId) return;
  const snoozedUntil = parsed.data.status === "snoozed" ? new Date(parsed.data.snoozedUntil ?? "") : null;
  if (parsed.data.status === "snoozed") {
    const minimum = Date.now() + 5 * 60_000;
    const maximum = Date.now() + 366 * 24 * 60 * 60_000;
    if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil.getTime() < minimum || snoozedUntil.getTime() > maximum) return;
  }
  await queryPostgres(
    `insert into public.in_app_notification_states
       (tenant_id,user_id,source_type,source_id,status,snoozed_until,cleared_at,resurface_reason)
     values ($1,$2,$3,$4,$5,$6,
       case when $5='cleared' then now() else null end,
       case when $5='snoozed' then 'owner_requested' else null end)
     on conflict (tenant_id,user_id,source_type,source_id) do update
     set status=excluded.status,
         snoozed_until=excluded.snoozed_until,
         cleared_at=excluded.cleared_at,
         resurface_reason=excluded.resurface_reason,
         updated_at=now()`,
    [tenantId, session.userId, parsed.data.source, parsed.data.sourceId, parsed.data.status, snoozedUntil?.toISOString() ?? null]
  );
  await queryPostgres(
    `insert into public.operator_timeline_events
       (tenant_id,event_family,event_type,title,body,primary_entity_type,primary_entity_id,metadata_json)
     values ($1,'system','notification_state_changed',$2,$3,'in_app_notification',$4,$5::jsonb)`,
    [
      tenantId,
      parsed.data.status === "snoozed" ? "Notification snoozed" : parsed.data.status === "cleared" ? "Notification cleared" : "Notification state updated",
      parsed.data.status === "snoozed" ? `This item will return after ${snoozedUntil?.toISOString()}.` : "The source record remains available; only this user's notification state changed.",
      parsed.data.sourceId,
      JSON.stringify({ source: parsed.data.source, status: parsed.data.status, snoozedUntil: snoozedUntil?.toISOString() ?? null, userId: session.userId })
    ]
  );
  revalidatePath("/app/notifications");
}
