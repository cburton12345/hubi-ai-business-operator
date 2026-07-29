"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { liveActionPolicyForMode } from "@/lib/controls/autonomy-policy";
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
  // Follow-up discovery may run automatically, while each communication
  // channel keeps its own independent consent and live-send policy.
};

async function applyServiceControl(input: {
  workspaceId: string;
  featureKey: string;
  mode: z.infer<typeof modeSchema>;
  usageLimit: number | null;
  overagePolicy: z.infer<typeof overageSchema>;
  metadata: Record<string, unknown>;
}) {
  const status = input.mode === "off" ? "disabled" : input.usageLimit === null ? "enabled" : "limited";

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
      input.workspaceId,
      input.featureKey,
      status,
      input.usageLimit,
      JSON.stringify({
        approvalMode: input.mode,
        overagePolicy: input.overagePolicy,
        ...input.metadata
      })
    ]
  );

  const actionKeys = actionMap[input.featureKey] ?? [];
  for (const actionKey of actionKeys) {
    const policy = liveActionPolicyForMode(actionKey, input.mode);
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
        input.workspaceId,
        actionKey,
        policy.status,
        policy.requiresHumanApproval,
        JSON.stringify({
          controlledByFeature: input.featureKey,
          approvalMode: input.mode,
          note: policy.reason,
          ...input.metadata
        })
      ]
    );
  }
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
  const workspaceId = actor.workspace.id;

  await applyServiceControl({
    workspaceId,
    featureKey: parsed.data.featureKey,
    mode: parsed.data.mode,
    usageLimit,
    overagePolicy: parsed.data.overagePolicy,
    metadata: {
      updatedBy: actor.email,
      updatedByUserId: actor.userId,
      updatedFrom: "service_controls"
    }
  });

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
  revalidatePath("/app/autopilot");
  revalidatePath("/app/billing");
  revalidatePath("/app/setup");
}

export async function applyAutopilotPresetAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = z
    .object({
      preset: z.enum(["trusted_autopilot", "owner_shield", "growth_engine", "manual_first"])
    })
    .safeParse({
      preset: formData.get("preset")
    });

  if (!parsed.success) return;

  const workspaceId = actor.workspace.id;
  const presets: Record<typeof parsed.data.preset, { label: string; controls: Array<{ featureKey: string; mode: z.infer<typeof modeSchema>; usageLimit: number | null; overagePolicy: z.infer<typeof overageSchema> }> }> = {
    trusted_autopilot: {
      label: "Trusted Autopilot",
      controls: [
        { featureKey: "ai_generation", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "website_import", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "seo_autopilot", mode: "enabled", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "ai_search_visibility", mode: "enabled", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "content_studio", mode: "enabled", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "media_library", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "authority_engine", mode: "enabled", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "construction_job_health", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "growth_attribution", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "follow_up_recovery", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "email_send", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "sms_send", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "review_requests", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "publishing_queue", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "payment_collection", mode: "review_required", usageLimit: null, overagePolicy: "block" }
      ]
    },
    owner_shield: {
      label: "Owner Shield",
      controls: [
        { featureKey: "ai_generation", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "follow_up_recovery", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "email_send", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "review_requests", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "payment_collection", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "calendar_sync", mode: "draft_only", usageLimit: null, overagePolicy: "block" },
        { featureKey: "growth_attribution", mode: "enabled", usageLimit: null, overagePolicy: "allow" }
      ]
    },
    growth_engine: {
      label: "Growth Engine",
      controls: [
        { featureKey: "website_import", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "seo_autopilot", mode: "draft_only", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "hosted_growth_pages", mode: "draft_only", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "publishing_queue", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "growth_attribution", mode: "enabled", usageLimit: null, overagePolicy: "allow" },
        { featureKey: "review_requests", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" },
        { featureKey: "ugc_proof_capture", mode: "review_required", usageLimit: null, overagePolicy: "allow_with_review" }
      ]
    },
    manual_first: {
      label: "Manual First",
      controls: [
        { featureKey: "ai_generation", mode: "draft_only", usageLimit: null, overagePolicy: "block" },
        { featureKey: "follow_up_recovery", mode: "draft_only", usageLimit: null, overagePolicy: "block" },
        { featureKey: "email_send", mode: "draft_only", usageLimit: null, overagePolicy: "block" },
        { featureKey: "sms_send", mode: "off", usageLimit: 0, overagePolicy: "block" },
        { featureKey: "publishing_queue", mode: "draft_only", usageLimit: null, overagePolicy: "block" },
        { featureKey: "payment_collection", mode: "review_required", usageLimit: null, overagePolicy: "block" }
      ]
    }
  };
  const preset = presets[parsed.data.preset];

  for (const control of preset.controls) {
    await applyServiceControl({
      workspaceId,
      ...control,
      metadata: {
        updatedBy: actor.email,
        updatedByUserId: actor.userId,
        updatedFrom: "autopilot_preset",
        autopilotPreset: parsed.data.preset
      }
    });
  }

  const workflowMode =
    parsed.data.preset === "trusted_autopilot"
      ? "auto_allowed"
      : parsed.data.preset === "manual_first"
        ? "draft_only"
        : "approval_required";
  await queryPostgres(
    `
    update public.ai_agent_workflows
    set run_mode = $2,
        output_policy_json = output_policy_json || jsonb_build_object(
          'mode', $2::text,
          'customerSendsControlledSeparately', true,
          'publicPublishingControlledSeparately', true
        ),
        updated_at = now()
    where tenant_id = $1 and status <> 'archived'
    `,
    [workspaceId, workflowMode]
  );

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
    values ($1, 'system', 'autopilot_preset_applied', $2, $3, $4::jsonb)
    `,
    [
      workspaceId,
      `${preset.label} mode selected`,
      `${preset.label} updated ${preset.controls.length} service controls and set existing AI workflows to ${workflowMode}.`,
      JSON.stringify({
        preset: parsed.data.preset,
        workflowMode,
        controls: preset.controls.map((control) => ({ featureKey: control.featureKey, mode: control.mode }))
      })
    ]
  );

  revalidatePath("/app/controls");
  revalidatePath("/app/autopilot");
  revalidatePath("/app/ai-workforce");
  revalidatePath("/app/automation-timeline");
}
