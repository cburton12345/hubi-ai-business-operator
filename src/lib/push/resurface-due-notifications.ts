import { queryPostgres } from "@/lib/db/postgres";
import { getActiveNotificationSource, type NotificationSourceType } from "@/lib/push/notification-sources";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";

type DueStateRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  source_type: NotificationSourceType;
  source_id: string;
  last_resurfaced_at: Date;
  resurface_count: number;
};

export type NotificationResurfaceResult = {
  ok: boolean;
  claimed: number;
  resurfaced: number;
  sourceResolved: number;
  pushSent: number;
  pushSkipped: number;
  failed: number;
};

export async function resurfaceDueNotifications(limit = 20): Promise<NotificationResurfaceResult> {
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const claimed = await queryPostgres<DueStateRow>(
    `with due as (
       select id
       from public.in_app_notification_states
       where status = 'snoozed' and snoozed_until <= now()
       order by snoozed_until asc, id asc
       for update skip locked
       limit $1
     )
     update public.in_app_notification_states state
     set status = 'unread', snoozed_until = null, cleared_at = null,
         resurface_reason = 'snooze_expired',
         resurface_count = state.resurface_count + 1,
         last_resurfaced_at = now(), updated_at = now()
     from due
     where state.id = due.id
     returning state.id, state.tenant_id, state.user_id, state.source_type, state.source_id,
               state.last_resurfaced_at, state.resurface_count`,
    [boundedLimit],
  );

  if (!claimed) {
    return { ok: false, claimed: 0, resurfaced: 0, sourceResolved: 0, pushSent: 0, pushSkipped: 0, failed: 1 };
  }

  const result: NotificationResurfaceResult = {
    ok: true,
    claimed: claimed.rows.length,
    resurfaced: 0,
    sourceResolved: 0,
    pushSent: 0,
    pushSkipped: 0,
    failed: 0,
  };
  const preferenceCache = new Map<string, Awaited<ReturnType<typeof getPushNotificationPreferences>>>();

  for (const state of claimed.rows) {
    try {
      const source = await getActiveNotificationSource(state.tenant_id, state.source_type, state.source_id);
      if (!source) {
        await queryPostgres(
          `update public.in_app_notification_states
           set status='cleared', cleared_at=now(), resurface_reason='source_resolved_before_due', updated_at=now()
           where id=$1 and status='unread' and last_resurfaced_at=$2`,
          [state.id, state.last_resurfaced_at.toISOString()],
        );
        result.sourceResolved += 1;
        continue;
      }

      result.resurfaced += 1;
      await queryPostgres(
        `insert into public.operator_timeline_events
           (tenant_id,event_family,event_type,title,body,primary_entity_type,primary_entity_id,metadata_json)
         values ($1,'system','notification_resurfaced',$2,$3,'in_app_notification',$4,$5::jsonb)`,
        [
          state.tenant_id,
          `Reminder returned: ${source.title}`,
          "A snoozed item returned to the active notification feed at its requested time.",
          state.source_id,
          JSON.stringify({
            notificationStateId: state.id,
            source: state.source_type,
            userId: state.user_id,
            resurfaceCount: state.resurface_count,
          }),
        ],
      );

      let preferences = preferenceCache.get(state.tenant_id);
      if (!preferences) {
        preferences = await getPushNotificationPreferences(state.tenant_id);
        preferenceCache.set(state.tenant_id, preferences);
      }
      const pushAllowed = pushPreferencesAllowEvent({
        preferences,
        severity: source.severity,
        status: source.status,
        ownerAttention: source.ownerAttention,
        moneyCents: source.moneyCents,
        riskType: source.riskType,
      });
      if (!pushAllowed) {
        result.pushSkipped += 1;
        continue;
      }

      const push = await sendWorkspacePushNotifications({
        tenantId: state.tenant_id,
        recipientUserId: state.user_id,
        eventType: "notification.snooze_expired",
        title: source.title,
        body: `Back on your list: ${source.body}`.slice(0, 500),
        url: source.actionUrl,
        tag: `notification-resurfaced-${state.id}-${state.resurface_count}`,
        metadata: {
          notificationStateId: state.id,
          source: state.source_type,
          sourceId: state.source_id,
          resurfaceCount: state.resurface_count,
        },
      });
      result.pushSent += push.sent;
      if (!push.ok) result.pushSkipped += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Notification resurface processing failed", {
        stateId: state.id,
        source: state.source_type,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  result.ok = result.failed === 0;
  return result;
}
