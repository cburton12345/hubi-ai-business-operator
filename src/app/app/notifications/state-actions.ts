"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  source: z.enum(["owner_event", "ai_work", "approval", "provider_request", "funding_alert"]),
  sourceId: z.string().uuid(),
  status: z.enum(["read", "acknowledged", "dismissed"])
});

export async function updateInAppNotificationStateAction(formData: FormData) {
  await requirePermission("tenant:view");
  const parsed = schema.safeParse({
    source: formData.get("source"),
    sourceId: formData.get("sourceId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (!session?.userId) return;
  await queryPostgres(
    `insert into public.in_app_notification_states (tenant_id,user_id,source_type,source_id,status)
     values ($1,$2,$3,$4,$5)
     on conflict (tenant_id,user_id,source_type,source_id) do update
     set status=excluded.status,updated_at=now()`,
    [tenantId, session.userId, parsed.data.source, parsed.data.sourceId, parsed.data.status]
  );
  revalidatePath("/app/notifications");
}
