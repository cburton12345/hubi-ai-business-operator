import "server-only";

import { queryPostgres } from "@/lib/db/postgres";
import { getActiveNotificationSource, type NotificationSourceType } from "@/lib/push/notification-sources";

export type NotificationUserState = "unread" | "read" | "acknowledged" | "snoozed" | "cleared";

export type SetNotificationStateInput = {
  tenantId: string;
  userId: string;
  source: NotificationSourceType;
  sourceId: string;
  status: NotificationUserState;
  snoozedUntil?: Date | null;
  resurfaceReason?: "owner_requested" | "ferocity_chat" | null;
};

export type SetNotificationStateResult =
  | { ok: true; stateId: string }
  | { ok: false; reason: "invalid_snooze" | "source_not_found" | "write_failed" };

export async function setNotificationState(input: SetNotificationStateInput): Promise<SetNotificationStateResult> {
  if (input.status === "snoozed") {
    const timestamp = input.snoozedUntil?.getTime() ?? Number.NaN;
    const minimum = Date.now() + 5 * 60_000;
    const maximum = Date.now() + 366 * 24 * 60 * 60_000;
    if (!Number.isFinite(timestamp) || timestamp < minimum || timestamp > maximum) {
      return { ok: false, reason: "invalid_snooze" };
    }
  }
  const sourceRecord = await getActiveNotificationSource(input.tenantId, input.source, input.sourceId);
  if (!sourceRecord) return { ok: false, reason: "source_not_found" };

  const snoozedUntil = input.status === "snoozed" ? input.snoozedUntil ?? null : null;
  const result = await queryPostgres<{ id: string }>(
    `insert into public.in_app_notification_states
       (tenant_id,user_id,source_type,source_id,status,snoozed_until,cleared_at,resurface_reason)
     values ($1,$2,$3,$4,$5,$6,
       case when $5='cleared' then now() else null end,
       case when $5='snoozed' then $7 else null end)
     on conflict (tenant_id,user_id,source_type,source_id) do update
     set status=excluded.status,
         snoozed_until=excluded.snoozed_until,
         cleared_at=excluded.cleared_at,
         resurface_reason=excluded.resurface_reason,
         updated_at=now()
     returning id`,
    [
      input.tenantId,
      input.userId,
      input.source,
      input.sourceId,
      input.status,
      snoozedUntil?.toISOString() ?? null,
      input.resurfaceReason ?? null,
    ],
  );
  const stateId = result?.rows[0]?.id;
  if (!stateId) return { ok: false, reason: "write_failed" };

  await queryPostgres(
    `insert into public.operator_timeline_events
       (tenant_id,event_family,event_type,title,body,primary_entity_type,primary_entity_id,metadata_json)
     values ($1,'system','notification_state_changed',$2,$3,'in_app_notification',$4,$5::jsonb)`,
    [
      input.tenantId,
      input.status === "snoozed"
        ? "Notification snoozed"
        : input.status === "cleared"
          ? "Notification cleared"
          : input.status === "unread"
            ? "Notification restored"
            : "Notification state updated",
      input.status === "snoozed"
        ? `This item will return after ${snoozedUntil?.toISOString()}.`
        : "The source record remains available; only this user's notification state changed.",
      input.sourceId,
      JSON.stringify({
        source: input.source,
        status: input.status,
        snoozedUntil: snoozedUntil?.toISOString() ?? null,
        userId: input.userId,
      }),
    ],
  );

  return { ok: true, stateId };
}
