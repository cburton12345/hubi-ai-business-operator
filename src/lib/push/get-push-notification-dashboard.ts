import { queryPostgres } from "@/lib/db/postgres";
import { getPushNotificationPreferences, type PushNotificationPreferences } from "@/lib/push/preferences";
import { getPushReadiness } from "@/lib/push/web-push";
import { getOwnerRemindersDashboard, type OwnerReminder, type ReminderAssignee } from "@/lib/reminders/owner-reminders";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type PushNotificationDashboard = {
  readiness: ReturnType<typeof getPushReadiness>;
  preferences: PushNotificationPreferences;
  metrics: {
    activeSubscriptions: number;
    failedSubscriptions: number;
    sentEvents: number;
    failedEvents: number;
    skippedEvents: number;
    activeReminders: number;
    dueReminders: number;
    dailyGoals: number;
    meetingReminders: number;
  };
  reminders: OwnerReminder[];
  assignees: ReminderAssignee[];
  subscriptions: {
    id: string;
    status: string;
    permission: string;
    userAgent: string;
    lastSeenAt: string;
    lastSuccessAt: string | null;
    lastError: string | null;
  }[];
  events: {
    id: string;
    eventType: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
    errorMessage: string | null;
  }[];
};

function n(value: unknown) {
  return Number(value ?? 0);
}

export async function getPushNotificationDashboard(): Promise<PushNotificationDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const readiness = getPushReadiness();
  const [preferences, reminderDashboard, metricsResult, subscriptionsResult, eventsResult] = await Promise.all([
    getPushNotificationPreferences(tenantId),
    getOwnerRemindersDashboard(tenantId),
    queryPostgres<{
      active_subscriptions: string;
      failed_subscriptions: string;
      sent_events: string;
      failed_events: string;
      skipped_events: string;
    }>(
      `
      select
        (select count(*) from public.push_subscriptions where tenant_id = $1 and status = 'active')::text as active_subscriptions,
        (select count(*) from public.push_subscriptions where tenant_id = $1 and status in ('failed','expired'))::text as failed_subscriptions,
        (select count(*) from public.push_notification_events where tenant_id = $1 and status = 'sent')::text as sent_events,
        (select count(*) from public.push_notification_events where tenant_id = $1 and status = 'failed')::text as failed_events,
        (select count(*) from public.push_notification_events where tenant_id = $1 and status = 'skipped')::text as skipped_events
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      status: string;
      permission: string;
      user_agent: string | null;
      last_seen_at: Date;
      last_success_at: Date | null;
      last_error: string | null;
    }>(
      `
      select id, status, permission, user_agent, last_seen_at, last_success_at, last_error
      from public.push_subscriptions
      where tenant_id = $1
      order by updated_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      event_type: string;
      title: string;
      body: string;
      status: string;
      created_at: Date;
      error_message: string | null;
    }>(
      `
      select id, event_type, title, body, status, created_at, error_message
      from public.push_notification_events
      where tenant_id = $1
      order by created_at desc
      limit 12
      `,
      [tenantId]
    )
  ]);

  const metrics = metricsResult?.rows[0];
  return {
    readiness,
    preferences,
    metrics: {
      activeSubscriptions: n(metrics?.active_subscriptions),
      failedSubscriptions: n(metrics?.failed_subscriptions),
      sentEvents: n(metrics?.sent_events),
      failedEvents: n(metrics?.failed_events),
      skippedEvents: n(metrics?.skipped_events),
      activeReminders: reminderDashboard.metrics.active,
      dueReminders: reminderDashboard.metrics.dueNow,
      dailyGoals: reminderDashboard.metrics.dailyGoals,
      meetingReminders: reminderDashboard.metrics.meetings
    },
    reminders: reminderDashboard.reminders,
    assignees: reminderDashboard.assignees,
    subscriptions: (subscriptionsResult?.rows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      permission: row.permission,
      userAgent: row.user_agent ?? "Unknown device",
      lastSeenAt: row.last_seen_at.toISOString(),
      lastSuccessAt: row.last_success_at?.toISOString() ?? null,
      lastError: row.last_error
    })),
    events: (eventsResult?.rows ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      title: row.title,
      body: row.body,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      errorMessage: row.error_message
    }))
  };
}
