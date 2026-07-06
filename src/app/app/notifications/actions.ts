"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { upsertPushNotificationPreferences, type PushSeverity } from "@/lib/push/preferences";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const severitySchema = z.enum(["info", "low", "medium", "high", "critical"]);

const preferencesSchema = z.object({
  ownerAlertsEnabled: z.boolean(),
  minSeverity: severitySchema,
  minMoneyCents: z.number().int().min(0).max(10_000_000),
  notifyRevenue: z.boolean(),
  notifyFinancial: z.boolean(),
  notifyCustomer: z.boolean(),
  notifyLegal: z.boolean(),
  notifySafety: z.boolean(),
  notifyAutomation: z.boolean(),
  notifyLowConfidence: z.boolean(),
  notifyApproval: z.boolean()
});

const reminderSchema = z.object({
  recipientUserId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(500).optional(),
  reminderType: z.enum(["meeting", "goal", "task", "follow_up", "payment", "personal", "custom"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  remindAt: z.string().min(1),
  recurrence: z.enum(["none", "daily", "weekly"]),
  actionUrl: z.string().trim().startsWith("/").max(200).optional(),
  pushEnabled: z.boolean()
});

const statusSchema = z.object({
  reminderId: z.string().uuid(),
  status: z.enum(["active", "paused", "completed", "archived"])
});

const rescheduleSchema = z.object({
  reminderId: z.string().uuid(),
  remindAt: z.string().min(1),
  recurrence: z.enum(["none", "daily", "weekly"])
});

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function updatePushNotificationPreferences(formData: FormData) {
  const dollars = Number(formData.get("minMoneyDollars") ?? 100);
  const parsed = preferencesSchema.parse({
    ownerAlertsEnabled: checkbox(formData, "ownerAlertsEnabled"),
    minSeverity: formData.get("minSeverity") as PushSeverity,
    minMoneyCents: Math.round(Math.max(0, dollars) * 100),
    notifyRevenue: checkbox(formData, "notifyRevenue"),
    notifyFinancial: checkbox(formData, "notifyFinancial"),
    notifyCustomer: checkbox(formData, "notifyCustomer"),
    notifyLegal: checkbox(formData, "notifyLegal"),
    notifySafety: checkbox(formData, "notifySafety"),
    notifyAutomation: checkbox(formData, "notifyAutomation"),
    notifyLowConfidence: checkbox(formData, "notifyLowConfidence"),
    notifyApproval: checkbox(formData, "notifyApproval")
  });

  const tenantId = await getCurrentWorkspaceId();
  await upsertPushNotificationPreferences(tenantId, parsed);
  revalidatePath("/app/notifications");
}

export async function createOwnerReminderAction(formData: FormData) {
  const parsed = reminderSchema.safeParse({
    recipientUserId: String(formData.get("recipientUserId") ?? ""),
    title: formData.get("title"),
    body: String(formData.get("body") ?? ""),
    reminderType: formData.get("reminderType"),
    priority: formData.get("priority"),
    remindAt: formData.get("remindAt"),
    recurrence: formData.get("recurrence"),
    actionUrl: String(formData.get("actionUrl") ?? "/app/attention-command") || "/app/attention-command",
    pushEnabled: checkbox(formData, "pushEnabled")
  });
  if (!parsed.success) return;

  const remindAt = dateTime(parsed.data.remindAt);
  if (!remindAt) return;

  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const recipientUserId = parsed.data.recipientUserId || session?.userId || null;
  if (recipientUserId) {
    const allowed = await queryPostgres(
      `
      select 1
      from public.tenant_users
      where tenant_id = $1
        and user_id = $2
        and status = 'active'
      limit 1
      `,
      [tenantId, recipientUserId]
    );
    if ((allowed?.rowCount ?? 0) === 0) return;
  }

  await queryPostgres(
    `
    insert into public.owner_reminders (
      tenant_id, user_id, title, body, reminder_type, priority, remind_at, recurrence,
      push_enabled, action_url, next_due_at, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7, $11::jsonb)
    `,
    [
      tenantId,
      recipientUserId,
      parsed.data.title,
      parsed.data.body?.trim() || null,
      parsed.data.reminderType,
      parsed.data.priority,
      remindAt.toISOString(),
      parsed.data.recurrence,
      parsed.data.pushEnabled,
      parsed.data.actionUrl || "/app/attention-command",
      JSON.stringify({ createdFrom: "notifications_page", createdByEmail: session?.email ?? null })
    ]
  );

  revalidatePath("/app/notifications");
  revalidatePath("/app/attention-command");
}

export async function rescheduleOwnerReminderAction(formData: FormData) {
  const parsed = rescheduleSchema.safeParse({
    reminderId: formData.get("reminderId"),
    remindAt: formData.get("remindAt"),
    recurrence: formData.get("recurrence")
  });
  if (!parsed.success) return;

  const remindAt = dateTime(parsed.data.remindAt);
  if (!remindAt) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.owner_reminders
    set remind_at = $3,
        next_due_at = $3,
        recurrence = $4,
        status = case when status = 'completed' then 'active' else status end,
        completed_at = case when status = 'completed' then null else completed_at end,
        updated_at = now()
    where tenant_id = $1
      and id = $2
    `,
    [tenantId, parsed.data.reminderId, remindAt.toISOString(), parsed.data.recurrence]
  );

  revalidatePath("/app/notifications");
  revalidatePath("/app/attention-command");
}

export async function updateOwnerReminderStatusAction(formData: FormData) {
  const parsed = statusSchema.safeParse({
    reminderId: formData.get("reminderId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.owner_reminders
    set status = $3,
        completed_at = case when $3 = 'completed' then now() else completed_at end,
        updated_at = now()
    where tenant_id = $1
      and id = $2
    `,
    [tenantId, parsed.data.reminderId, parsed.data.status]
  );

  revalidatePath("/app/notifications");
  revalidatePath("/app/attention-command");
}
