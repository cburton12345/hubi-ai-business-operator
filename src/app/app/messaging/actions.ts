"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const accountSchema = z.string().uuid();

export async function emergencyPauseMessagingAccountAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const accountId = accountSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return;
  const tenantId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    update public.tenant_messaging_accounts
    set emergency_paused = true,
        live_sending_enabled = false,
        connection_status = case when ownership_mode = 'manual_assisted' then connection_status else 'paused' end,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      accountId.data,
      JSON.stringify({
        emergencyPausedAt: new Date().toISOString(),
        emergencyPausedFrom: "messaging_page"
      })
    ]
  );
  revalidatePath("/app/messaging");
  revalidatePath("/app/actions");
}

export async function clearMessagingEmergencyPauseAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const accountId = accountSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return;
  const tenantId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    update public.tenant_messaging_accounts
    set emergency_paused = false,
        live_sending_enabled = false,
        connection_status = case
          when ownership_mode = 'manual_assisted' then connection_status
          when credentials_status = 'configured' then 'configured'
          else 'not_connected'
        end,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      accountId.data,
      JSON.stringify({
        emergencyPauseClearedAt: new Date().toISOString(),
        reactivationRequired: true
      })
    ]
  );
  revalidatePath("/app/messaging");
  revalidatePath("/app/actions");
}

