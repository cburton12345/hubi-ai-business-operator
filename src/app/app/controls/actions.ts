"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";

const modeSchema = z.enum(["off", "draft_only", "review_required", "enabled"]);
const overageSchema = z.enum(["block", "allow_with_review", "allow"]);

const actionMap: Record<string, string[]> = {
  sms_send: ["sms_send"],
  email_send: ["email_send"],
  review_requests: ["review_request"],
  calendar_sync: ["calendar_sync"],
  publishing_queue: ["publish_content", "gbp_publish"],
  hosted_growth_pages: ["publish_content"],
  follow_up_recovery: ["sms_send", "email_send"]
};

function policyStatusForMode(mode: z.infer<typeof modeSchema>) {
  if (mode === "off") return "disabled";
  if (mode === "draft_only") return "review_only";
  if (mode === "review_required") return "approval_required";
  return "approval_required";
}

export async function updateServiceControlAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = z
    .object({
      featureKey: z.string().min(2),
      mode: modeSchema,
      usageLimit: z.string().optional(),
      overagePolicy: overageSchema
    })
    .safeParse({
      featureKey: formData.get("featureKey"),
      mode: formData.get("mode"),
      usageLimit: formData.get("usageLimit")?.toString(),
      overagePolicy: formData.get("overagePolicy")
    });

  if (!parsed.success) return;

  const usageLimit = parsed.data.usageLimit?.trim() ? Math.max(Number(parsed.data.usageLimit), 0) : null;
  const status = parsed.data.mode === "off" ? "disabled" : usageLimit === null ? "enabled" : "limited";
  const workspaceId = actor.workspace.id;

  await queryPostgres(
    `
    update public.workspace_feature_entitlements
    set status = $3,
        usage_limit = $4,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and feature_key = $2
    `,
    [
      workspaceId,
      parsed.data.featureKey,
      status,
      usageLimit,
      JSON.stringify({
        approvalMode: parsed.data.mode,
        overagePolicy: parsed.data.overagePolicy,
        updatedBy: actor.email,
        updatedByUserId: actor.userId,
        updatedFrom: "service_controls"
      })
    ]
  );

  const actionKeys = actionMap[parsed.data.featureKey] ?? [];
  for (const actionKey of actionKeys) {
    await queryPostgres(
      `
      update public.live_action_policies
      set status = $3,
          requires_human_approval = $4,
          metadata_json = metadata_json || $5::jsonb,
          updated_at = now()
      where tenant_id = $1 and action_key = $2
      `,
      [
        workspaceId,
        actionKey,
        policyStatusForMode(parsed.data.mode),
        parsed.data.mode !== "enabled",
        JSON.stringify({
          controlledByFeature: parsed.data.featureKey,
          approvalMode: parsed.data.mode,
          note: parsed.data.mode === "enabled" ? "Provider actions still require provider readiness before live sending or publishing." : "Service control updated."
        })
      ]
    );
  }

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id,
      event_family,
      event_type,
      title,
      body,
      metadata_json
    )
    values ($1, 'system', 'service_control_updated', 'Service control updated', $2, $3::jsonb)
    `,
    [
      workspaceId,
      `${parsed.data.featureKey} set to ${parsed.data.mode}.`,
      JSON.stringify({
        featureKey: parsed.data.featureKey,
        mode: parsed.data.mode,
        usageLimit,
        overagePolicy: parsed.data.overagePolicy
      })
    ]
  );

  revalidatePath("/app/controls");
  revalidatePath("/app/billing");
  revalidatePath("/app/setup");
}
