"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import {
  getManagedVideoConfiguration,
  getVideoGenerationProvider,
  normalizeVideoDuration
} from "@/lib/providers/video-adapters";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const videoActionSchema = z.object({
  videoJobId: z.string().uuid(),
  costApproval: z.literal("true").optional()
});

type VideoJobRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  provider_key: string;
  status: string;
  goal: string | null;
  script_text: string | null;
  scenes_json: unknown;
  provider_request_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  provider_response_json: Record<string, unknown> | null;
};

function aspectRatio(value: unknown) {
  if (value === "16:9") return "16:9";
  if (Array.isArray(value) && value.includes("16:9")) return "16:9";
  return "9:16";
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function loadVideoJob(tenantId: string, videoJobId: string) {
  const result = await queryPostgres<VideoJobRow>(
    `
    select id, tenant_id, brand_id, provider_key, status, goal, script_text, scenes_json,
           provider_request_json, metadata_json, provider_response_json
    from public.marketing_video_jobs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, videoJobId]
  );
  return result?.rows[0] ?? null;
}

async function recordVideoError(tenantId: string, videoJobId: string, message: string) {
  await queryPostgres(
    `
    update public.marketing_video_jobs
    set error_message = $3,
        history_json = history_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      videoJobId,
      message.slice(0, 500),
      JSON.stringify([{ status: "blocked", at: new Date().toISOString(), note: message.slice(0, 500) }])
    ]
  );
}

export async function submitVideoRenderAction(formData: FormData) {
  await requirePermission("approval:review_high");
  const parsed = videoActionSchema.safeParse({
    videoJobId: formData.get("videoJobId"),
    costApproval: formData.get("costApproval")
  });
  if (!parsed.success || parsed.data.costApproval !== "true") return;

  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const job = await loadVideoJob(tenantId, parsed.data.videoJobId);
  if (!job || !["needs_review", "provider_ready", "failed"].includes(job.status)) return;

  const [gate, configuration] = await Promise.all([
    getServiceGate(tenantId, "ai_video_generation"),
    Promise.resolve(getManagedVideoConfiguration())
  ]);
  if (!gate.enabled) {
    await recordVideoError(tenantId, job.id, gate.reason);
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }
  if (!configuration) {
    await recordVideoError(
      tenantId,
      job.id,
      "Live video is paused until the provider key, model, profitable per-second pricing, and both monthly cost caps are configured."
    );
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }
  if (env.FEROCITY_USAGE_BILLING_ENABLED?.toLowerCase() !== "true") {
    await recordVideoError(tenantId, job.id, "Live managed video is paused until usage billing is enabled.");
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

  const subscription = await queryPostgres<{
    plan_key: string | null;
    status: string;
    external_customer_ref: string | null;
  }>(
    `
    select t.plan_key, s.status, s.external_customer_ref
    from public.tenants t
    left join public.billing_subscriptions s on s.tenant_id = t.id
    where t.id = $1
    limit 1
    `,
    [tenantId]
  );
  const billing = subscription?.rows[0];
  if (!billing?.external_customer_ref || !["active", "trialing"].includes(billing.status)) {
    await recordVideoError(tenantId, job.id, "An active Stripe subscription is required before managed rendering can incur provider charges.");
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

  const request = safeRecord(job.provider_request_json);
  const metadata = safeRecord(job.metadata_json);
  const seconds = normalizeVideoDuration(
    configuration.providerKey,
    Number(metadata.durationSeconds ?? request.durationSeconds)
  );
  const providerCostCents = seconds * configuration.providerCostCentsPerSecond;
  const customerChargeCents = seconds * configuration.customerPriceCentsPerSecond;
  const usageKey = `premium-video:${job.id}:${configuration.providerKey}`;

  const reservation = await queryPostgres<{ id: string }>(
    `
    with budget_lock as (
      select pg_advisory_xact_lock(hashtext('ferocity:managed-video')) as locked
    ),
    usage as (
      select
        coalesce(sum(provider_cost_cents), 0) as global_cost,
        coalesce(sum(provider_cost_cents) filter (where tenant_id = $1), 0) as workspace_cost
      from public.usage_meter_events, budget_lock
      where feature_key = 'premium_video'
        and occurred_at >= date_trunc('month', now())
        and status not in ('void', 'failed')
    )
    insert into public.usage_meter_events (
      tenant_id, brand_id, user_id, plan_key, feature_key, provider_key,
      source_table, source_id, unit_type, quantity, provider_cost_cents,
      customer_charge_cents, status, source, idempotency_key, metadata_json
    )
    select
      $1, $2, $3, $4, 'premium_video', $13,
      'marketing_video_jobs', $5, 'video_second', $6, $7,
      $8, 'pending_review', 'system', $9, $10::jsonb
    from usage
    where usage.global_cost + $7 <= $11
      and usage.workspace_cost + $7 <= $12
    on conflict (tenant_id, idempotency_key) do nothing
    returning id
    `,
    [
      tenantId,
      job.brand_id,
      session?.userId ?? null,
      billing.plan_key,
      job.id,
      seconds,
      providerCostCents,
      customerChargeCents,
      usageKey,
      JSON.stringify({
        approvedByCustomer: true,
        providerCostCentsPerSecond: configuration.providerCostCentsPerSecond,
        customerPriceCentsPerSecond: configuration.customerPriceCentsPerSecond
      }),
      configuration.globalMonthlyBudgetCents,
      configuration.workspaceMonthlyBudgetCents,
      configuration.providerKey
    ]
  );
  const usageId = reservation?.rows[0]?.id;
  if (!usageId) {
    await recordVideoError(
      tenantId,
      job.id,
      "This render was already submitted or a managed-video monthly cost cap would be exceeded."
    );
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

  const provider = getVideoGenerationProvider(configuration.providerKey);
  if (!provider) return;
  const prompt = [
    job.goal,
    job.script_text,
    `Scene plan: ${JSON.stringify(job.scenes_json ?? []).slice(0, 3500)}`,
    "Keep all visible claims truthful. Do not invent logos, reviews, credentials, prices, or results."
  ].filter(Boolean).join("\n\n").slice(0, 9000);
  const result = await provider.createVideo(
    {
      tenantId,
      brandId: job.brand_id,
      correlationId: `premium-video:${job.id}`,
      idempotencyKey: usageKey,
      liveActionsEnabled: true
    },
    {
      prompt,
      durationSeconds: seconds,
      aspectRatio: aspectRatio(request.aspectRatios ?? metadata.platform),
      model: configuration.model
    }
  );

  if (!result.ok) {
    await queryPostgres(
      `
      update public.usage_meter_events
      set status = 'failed', provider_cost_cents = 0, customer_charge_cents = 0,
          metadata_json = metadata_json || $3::jsonb
      where tenant_id = $1 and id = $2
      `,
      [tenantId, usageId, JSON.stringify({ errorCategory: result.errorCategory, safeMessage: result.safeMessage })]
    );
    await recordVideoError(tenantId, job.id, result.safeMessage);
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

  await queryPostgres(
    `
    with usage_update as (
      update public.usage_meter_events
      set provider_resource_id = $3, provider_event_id = $3, status = 'approved',
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and id = $2
      returning id
    ),
    charge_insert as (
      insert into public.billing_usage_charges (
        tenant_id, plan_key, charge_key, fee_family, description, source_table,
        source_id, amount_cents, status, approved_by_user_id, approved_at, metadata_json
      )
      select
        $1, $5, $6, 'usage_rebilling', 'Managed AI video render',
        'marketing_video_jobs', $7, $8, 'approved', $9, now(), $10::jsonb
      from usage_update
      on conflict (tenant_id, charge_key, source_table, source_id) where source_table is not null and source_id is not null
      do nothing
      returning id
    )
    update public.marketing_video_jobs
    set provider_key = $13, status = 'submitted',
        provider_response_json = $11::jsonb, error_message = null,
        history_json = history_json || $12::jsonb, updated_at = now()
    where tenant_id = $1 and id = $7
      and exists (select 1 from usage_update)
    `,
    [
      tenantId,
      usageId,
      result.data.jobId,
      JSON.stringify({ providerStatus: result.data.status }),
      billing.plan_key,
      `premium-video:${job.id}`,
      job.id,
      Math.ceil(customerChargeCents),
      session?.userId ?? null,
      JSON.stringify({
        providerCostCents,
        customerChargeCents,
        customerApprovedAt: new Date().toISOString()
      }),
      JSON.stringify({
        providerJobId: result.data.jobId,
        providerStatus: result.data.status,
        seconds,
        estimatedProviderCostCents: providerCostCents,
        approvedCustomerChargeCents: customerChargeCents
      }),
      JSON.stringify([{
        status: "submitted",
        at: new Date().toISOString(),
        note: `Submitted to ${configuration.providerKey === "google_veo" ? "Google Veo" : "OpenAI Video"} for ${seconds} seconds after cost approval.`
      }]),
      configuration.providerKey
    ]
  );

  revalidatePath(`/app/marketing-os/video/${job.id}`);
  revalidatePath("/app/ai-usage");
  revalidatePath("/app/billing");
}

export async function refreshVideoRenderAction(formData: FormData) {
  await requirePermission("approval:review_high");
  const parsed = videoActionSchema.safeParse({ videoJobId: formData.get("videoJobId") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const job = await loadVideoJob(tenantId, parsed.data.videoJobId);
  if (!job || !["submitted", "processing"].includes(job.status)) return;
  const response = safeRecord(job.provider_response_json);
  const providerJobId = typeof response.providerJobId === "string" ? response.providerJobId : null;
  const provider = getVideoGenerationProvider(job.provider_key);
  if (!providerJobId || !provider) return;

  const result = await provider.getVideo(
    {
      tenantId,
      brandId: job.brand_id,
      correlationId: `premium-video-refresh:${job.id}`,
      idempotencyKey: `premium-video-refresh:${job.id}`,
      liveActionsEnabled: false
    },
    providerJobId
  );
  if (!result.ok) {
    await recordVideoError(tenantId, job.id, result.safeMessage);
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

  const completed = result.data.status === "completed";
  const failed = result.data.status === "failed";
  await queryPostgres(
    `
    update public.marketing_video_jobs
    set status = $3,
        output_url = case when $4 then $5 else output_url end,
        error_message = case when $6 then 'The provider reported that video generation failed.' else null end,
        provider_response_json = provider_response_json || $7::jsonb,
        history_json = history_json || $8::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      job.id,
      completed ? "completed" : failed ? "failed" : "processing",
      completed,
      `/api/video/${job.id}/content`,
      failed,
      JSON.stringify({ providerStatus: result.data.status, refreshedAt: new Date().toISOString() }),
      JSON.stringify([{
        status: result.data.status,
        at: new Date().toISOString(),
        note: completed ? "Rendered video is ready inside Ferocity." : `Provider status: ${result.data.status}.`
      }])
    ]
  );
  revalidatePath(`/app/marketing-os/video/${job.id}`);
}
