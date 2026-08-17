import { queryPostgres } from "@/lib/db/postgres";
import { getPushNotificationPreferences, type PushNotificationPreferences } from "@/lib/push/preferences";
import { getPushReadiness } from "@/lib/push/web-push";
import { getOwnerRemindersDashboard, type OwnerReminder, type ReminderAssignee } from "@/lib/reminders/owner-reminders";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getCurrentAppSession } from "@/lib/auth/session";

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
    inAppAttention: number;
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
    readState: string;
    errorMessage: string | null;
  }[];
  inAppNotifications: {
    id: string;
    source: "owner_event" | "ai_work" | "approval" | "provider_request" | "funding_alert";
    title: string;
    body: string;
    severity: string;
    status: string;
    actionUrl: string;
    createdAt: string;
    readState: string;
  }[];
};

function n(value: unknown) {
  return Number(value ?? 0);
}

export async function getPushNotificationDashboard(): Promise<PushNotificationDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const readiness = getPushReadiness();
  const [preferences, reminderDashboard, metricsResult, subscriptionsResult, eventsResult, inAppResult] = await Promise.all([
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
      read_state: string;
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
    ),
    queryPostgres<{
      id: string;
      source: "owner_event" | "ai_work" | "approval" | "provider_request" | "funding_alert";
      title: string;
      body: string;
      severity: string;
      status: string;
      action_url: string;
      created_at: Date;
      read_state: string;
    }>(
      `
      select notifications.*,
        coalesce(state.status, 'unread') as read_state
      from (
        select
          e.id::text as id,
          'owner_event'::text as source,
          e.title,
          e.summary as body,
          e.severity,
          e.status,
          coalesce(nullif(e.action_href, ''), '/app/owner-command-center') as action_url,
          e.occurred_at as created_at
        from public.owner_command_events e
        where e.tenant_id = $1
          and e.status <> 'archived'
          and (
            e.occurred_at >= now() - interval '90 days'
            or e.status in ('open', 'needs_owner', 'critical', 'watching')
          )

        union all

        select
          o.id::text as id,
          'ai_work'::text as source,
          o.title,
          case
            when o.status = 'needs_review' then 'An AI employee prepared this work and needs your decision before it continues.'
            when o.status in ('blocked', 'failed') then 'An AI employee could not finish this work. Open it to see the blocker and next step.'
            when o.status = 'sent' then 'An AI employee completed and sent this authorized work.'
            else 'An AI employee prepared this work inside Ferocity.'
          end as body,
          case
            when o.status in ('blocked', 'failed') then 'high'
            when o.status = 'needs_review' then 'medium'
            when o.status = 'sent' then 'low'
            else 'info'
          end as severity,
          o.status,
          case when o.run_id is null then '/app/ai-workforce' else '/app/ai-workforce/results/' || o.run_id::text end as action_url,
          o.created_at
        from public.ai_agent_outputs o
        where o.tenant_id = $1
          and o.status in ('prepared', 'needs_review', 'sent', 'blocked', 'failed')
          and o.created_at >= now() - interval '30 days'

        union all

        select
          r.id::text as id,
          'ai_work'::text as source,
          replace(r.agent_key, '_', ' ') || case when r.status = 'failed' then ' failed' else ' completed' end as title,
          coalesce(nullif(r.summary, ''), nullif(r.error_message, ''), 'The AI employee run finished without a written summary.') as body,
          case when r.status = 'failed' then 'high' else 'info' end as severity,
          r.status,
          '/app/ai-workforce/results/' || r.id::text as action_url,
          coalesce(r.completed_at, r.created_at) as created_at
        from public.ai_agent_runs r
        where r.tenant_id = $1
          and r.status in ('completed', 'failed')
          and coalesce(r.completed_at, r.created_at) >= now() - interval '30 days'
          and not exists (
            select 1 from public.ai_agent_outputs output where output.run_id = r.id
          )

        union all

        select
          a.id::text as id,
          'approval'::text as source,
          'Approval needed: ' || replace(a.target_type, '_', ' ') as title,
          coalesce(nullif(a.notes, ''), 'Ferocity prepared work that needs a decision before it can continue.') as body,
          a.risk_level as severity,
          a.status,
          '/app/approvals'::text as action_url,
          a.created_at
        from public.approvals a
        where a.tenant_id = $1
          and a.status = 'pending'

        union all

        select
          r.id::text as id,
          'provider_request'::text as source,
          'Provider request: ' || r.provider_name as title,
          'Ferocity recorded this ' || replace(r.capability_category, '_', ' ') || ' connection request and will keep its status here.' as body,
          case when r.currently_using then 'high' else 'medium' end as severity,
          r.status,
          '/app/integrations#request-provider'::text as action_url,
          r.updated_at as created_at
        from public.provider_integration_requests r
        where r.tenant_id = $1
          and r.status not in ('available', 'declined')

        union all

        select
          f.id::text as id,
          'funding_alert'::text as source,
          f.title,
          f.summary as body,
          f.severity,
          f.status,
          coalesce(nullif(f.action_href, ''), '/app/provider-costs') as action_url,
          f.last_seen_at as created_at
        from public.provider_funding_alerts f
        where f.tenant_id = $1
          and f.status = 'active'
      ) notifications
      left join public.in_app_notification_states state
        on state.tenant_id = $1
       and state.user_id = $2::uuid
       and state.source_type = notifications.source
       and state.source_id = notifications.id::uuid
      where coalesce(state.status, 'unread') <> 'dismissed'
      order by
        case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
        created_at desc
      limit 40
      `,
      [tenantId, session?.userId ?? null]
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
      meetingReminders: reminderDashboard.metrics.meetings,
      inAppAttention: (inAppResult?.rows ?? []).filter((row) =>
        row.read_state === "unread" && (
        row.status === "needs_owner"
        || row.status === "critical"
        || row.status === "pending"
        || row.status === "active"
        || row.severity === "high"
        || row.severity === "critical")
      ).length
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
      readState: "read",
      errorMessage: row.error_message
    })),
    inAppNotifications: (inAppResult?.rows ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      body: row.body,
      severity: row.severity,
      status: row.status,
      actionUrl: row.action_url,
      createdAt: row.created_at.toISOString(),
      readState: row.read_state
    }))
  };
}
