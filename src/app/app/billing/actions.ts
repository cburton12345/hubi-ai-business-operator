"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const chargeSchema = z.object({ chargeId: z.string().uuid() });
const voiceLimitSchema = z.object({
  monthlyLimitDollars: z.union([
    z.literal(""),
    z.coerce.number().min(1).max(100_000)
  ])
});

export async function saveManagedVoiceLimitAction(formData: FormData) {
  await requirePermission("billing:manage");
  const parsed = voiceLimitSchema.safeParse({
    monthlyLimitDollars: formData.get("monthlyLimitDollars") ?? ""
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const limitCents = parsed.data.monthlyLimitDollars === ""
    ? null
    : Math.round(parsed.data.monthlyLimitDollars * 100);

  await queryPostgres(
    `
    insert into public.spend_limits (
      tenant_id, scope_type, scope_key, monthly_customer_charge_cap_cents,
      failed_payment_behavior, status, metadata_json
    )
    select
      $1, 'feature', 'ai_receptionist', $2, 'take_message_only', 'active',
      jsonb_build_object(
        'customerMaySetOptionalLimit', true,
        'customerLimitSource', case when $2::numeric is null then 'not_set' else 'customer' end,
        'customerLimitUpdatedAt', now()
      )
    where exists (
      select 1
      from public.tenants t
      left join public.billing_subscriptions s on s.tenant_id = t.id
      where t.id = $1
        and coalesce(s.plan_key, t.plan_key) in ('calls', 'starter', 'growth', 'operator', 'managed_operator')
    )
    on conflict (tenant_id, scope_type, scope_key) do update
    set monthly_customer_charge_cap_cents = excluded.monthly_customer_charge_cap_cents,
        metadata_json = public.spend_limits.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [tenantId, limitCents]
  );
  revalidatePath("/app/billing");
}

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
