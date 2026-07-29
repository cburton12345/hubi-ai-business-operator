"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const chargeSchema = z.object({ chargeId: z.string().uuid() });

export async function approveUsageChargeAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const parsed = chargeSchema.safeParse({ chargeId: formData.get("chargeId") });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.billing_usage_charges
    set status = 'approved',
        approved_by_user_id = $3,
        approved_at = now(),
        last_error = null,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status = 'pending_review'
    `,
    [tenantId, parsed.data.chargeId, actor.userId === "admin-token" ? null : actor.userId]
  );
  revalidatePath("/app/billing");
}

export async function voidUsageChargeAction(formData: FormData) {
  await requirePermission("billing:manage");
  const parsed = chargeSchema.safeParse({ chargeId: formData.get("chargeId") });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.billing_usage_charges
    set status = 'void', updated_at = now()
    where tenant_id = $1 and id = $2 and status in ('pending_review','approved','failed')
    `,
    [tenantId, parsed.data.chargeId]
  );
  revalidatePath("/app/billing");
}
