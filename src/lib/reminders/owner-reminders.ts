import { queryPostgres } from "@/lib/db/postgres";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OwnerReminder = {
  id: string;
  userId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  title: string;
  body: string | null;
  reminderType: string;
  priority: string;
  status: string;
  remindAt: string;
  recurrence: string;
  pushEnabled: boolean;
  actionUrl: string;
  lastSentAt: string | null;
  nextDueAt: string;
};

export type ReminderAssignee = {
  userId: string;
  name: string | null;
  email: string;
  role: string;
};

type OwnerReminderRow = {
  id: string;
  user_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  title: string;
  body: string | null;
  reminder_type: string;
  priority: string;
  status: string;
  remind_at: Date;
  recurrence: string;
  push_enabled: boolean;
  action_url: string;
  last_sent_at: Date | null;
  next_due_at: Date;
};

type DueReminderRow = OwnerReminderRow & {
  tenant_id: string;
  user_id: string | null;
};

function mapReminder(row: OwnerReminderRow): OwnerReminder {
  return {
    id: row.id,
    userId: row.user_id,
    assigneeName: row.assignee_name,
    assigneeEmail: row.assignee_email,
    title: row.title,
    body: row.body,
    reminderType: row.reminder_type,
    priority: row.priority,
    status: row.status,
    remindAt: row.remind_at.toISOString(),
    recurrence: row.recurrence,
    pushEnabled: row.push_enabled,
    actionUrl: row.action_url,
    lastSentAt: row.last_sent_at?.toISOString() ?? null,
    nextDueAt: row.next_due_at.toISOString()
  };
}

export async function getOwnerRemindersDashboard(tenantId = "") {
  const workspaceId = tenantId || (await getCurrentWorkspaceId());
  const [result, assigneesResult] = await Promise.all([
    queryPostgres<OwnerReminderRow>(
    `
    select r.id, r.user_id, u.name as assignee_name, u.email as assignee_email, r.title, r.body,
           r.reminder_type, r.priority, r.status, r.remind_at, r.recurrence, r.push_enabled,
           r.action_url, r.last_sent_at, r.next_due_at
    from public.owner_reminders r
    left join public.users u on u.id = r.user_id
    where r.tenant_id = $1
      and r.status <> 'archived'
    order by
      case when r.status = 'active' then 0 when r.status = 'paused' then 1 else 2 end,
      r.next_due_at asc
    limit 40
    `,
    [workspaceId]
    ),
    queryPostgres<{
      user_id: string;
      name: string | null;
      email: string;
      role: string;
    }>(
      `
      select u.id as user_id, u.name, u.email, tu.role
      from public.tenant_users tu
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = $1
        and tu.status = 'active'
      order by case tu.role when 'owner' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end, u.email
      limit 80
      `,
      [workspaceId]
    )
  ]);

  const reminders = (result?.rows ?? []).map(mapReminder);
  const now = Date.now();
  return {
    reminders,
    assignees: (assigneesResult?.rows ?? []).map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role
    })),
    metrics: {
      active: reminders.filter((row) => row.status === "active").length,
      dueNow: reminders.filter((row) => row.status === "active" && new Date(row.nextDueAt).getTime() <= now).length,
      dailyGoals: reminders.filter((row) => row.reminderType === "goal" && row.recurrence === "daily").length,
      meetings: reminders.filter((row) => row.reminderType === "meeting" && row.status === "active").length
    }
  };
}

function nextDueExpression(recurrence: string) {
  if (recurrence === "daily") return "next_due_at + interval '1 day'";
  if (recurrence === "weekly") return "next_due_at + interval '7 days'";
  return "next_due_at";
}

export async function sendDueOwnerReminders(limit = 50) {
  const due = await queryPostgres<DueReminderRow>(
    `
    select id, tenant_id, user_id, title, body, reminder_type, priority, status, remind_at, recurrence,
           push_enabled, action_url, last_sent_at, next_due_at
    from public.owner_reminders
    where status = 'active'
      and push_enabled = true
      and next_due_at <= now()
    order by next_due_at asc
    limit $1
    `,
    [limit]
  );

  const rows = due?.rows ?? [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const body = row.body ?? (row.reminder_type === "goal" ? "Daily goal reminder." : "Reminder due now.");
    const result = await sendWorkspacePushNotifications({
      tenantId: row.tenant_id,
      recipientUserId: row.user_id,
      eventType: `reminder.${row.reminder_type}`,
      title: row.title,
      body,
      url: row.action_url,
      tag: `owner-reminder-${row.id}`,
      metadata: {
        reminderId: row.id,
        recurrence: row.recurrence,
        priority: row.priority,
        nextDueAt: row.next_due_at.toISOString()
      }
    });

    if (result.ok) sent += result.sent;
    if (result.failed) failed += result.failed;
    if (result.skipped) skipped += 1;

    const nextSql = nextDueExpression(row.recurrence);
    await queryPostgres(
      `
      update public.owner_reminders
      set last_sent_at = now(),
          status = case when recurrence = 'none' then 'completed' else status end,
          completed_at = case when recurrence = 'none' then now() else completed_at end,
          next_due_at = case when recurrence = 'none' then next_due_at else ${nextSql} end,
          metadata_json = metadata_json || $2::jsonb,
          updated_at = now()
      where id = $1
      `,
      [
        row.id,
        JSON.stringify({
          lastPushResult: {
            ok: result.ok,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
            at: new Date().toISOString()
          }
        })
      ]
    );
  }

  return {
    ok: true,
    processed: rows.length,
    sent,
    failed,
    skipped
  };
}
