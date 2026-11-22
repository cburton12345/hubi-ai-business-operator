"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { notificationSourceTypes } from "@/lib/push/notification-sources";
import { setNotificationState } from "@/lib/push/notification-state";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  source: z.enum(notificationSourceTypes),
  sourceId: z.string().uuid(),
  status: z.enum(["unread", "read", "acknowledged", "snoozed", "cleared"]),
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
  await setNotificationState({
    tenantId,
    userId: session.userId,
    source: parsed.data.source,
    sourceId: parsed.data.sourceId,
    status: parsed.data.status,
    snoozedUntil,
    resurfaceReason: parsed.data.status === "snoozed" ? "owner_requested" : null,
  });
  revalidatePath("/app/notifications");
}
