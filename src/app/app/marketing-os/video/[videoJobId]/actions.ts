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

const variationSchema = z.object({
  videoJobId: z.string().uuid(),
  variationInstruction: z.string().trim().min(3).max(500),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"])
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

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
  const metadata = safeRecord(job.metadata_json);
  const preflight = safeRecord(metadata.creativePreflight);
  if (preflight.decision === "blocked") {
    await recordVideoError(
      tenantId,
      job.id,
      "Creative preflight found a blocking issue. Repair the concept or claim before paying for a render."
    );
    revalidatePath(`/app/marketing-os/video/${job.id}`);
    return;
  }

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
  const requestedSeconds = normalizeVideoDuration(
    configuration.providerKey,
    Number(metadata.durationSeconds ?? request.durationSeconds)
  );
  const referenceAssetUrls = stringList(request.referenceAssetUrls).slice(0, 3);
  const seconds = configuration.providerKey === "google_veo"
    && referenceAssetUrls.length > 0
    && !configuration.model.includes("lite")
    ? 8
    : requestedSeconds;
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
    `Creative direction: ${JSON.stringify(request.creativeDirection ?? {}).slice(0, 1800)}`,
    "Create source footage only. Leave exact captions, logos, URLs, phone numbers, and the final CTA card for Ferocity post-production so they cannot be misspelled.",
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
      assets: referenceAssetUrls,
      durationSeconds: seconds,
      aspectRatio: aspectRatio(request.aspectRatios ?? metadata.platform),
      model: configuration.model,
      quality: metadata.requestedQuality === "premium"
        ? "premium"
        : metadata.requestedQuality === "balanced"
          ? "balanced"
          : "economy"
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
      set provider_resource_id = $3, provider_event_id = $3,
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and id = $2
      returning id
    )
    update public.marketing_video_jobs
    set provider_key = $8, status = 'submitted',
        provider_response_json = $6::jsonb, error_message = null,
        history_json = history_json || $7::jsonb, updated_at = now()
    where tenant_id = $1 and id = $5
      and exists (select 1 from usage_update)
    `,
    [
      tenantId,
      usageId,
      result.data.jobId,
      JSON.stringify({ providerStatus: result.data.status, chargeState: "awaiting_successful_completion" }),
      job.id,
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
        note: `Submitted to ${configuration.providerKey === "google_veo" ? "Google Veo" : "OpenAI Video"} for ${seconds} seconds after cost approval. The customer charge stays pending until the provider succeeds.`
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
    with usage_update as (
      update public.usage_meter_events
      set status = case when $4 then 'approved' else 'failed' end,
          provider_cost_cents = case when $6 then 0 else provider_cost_cents end,
          customer_charge_cents = case when $6 then 0 else customer_charge_cents end,
          metadata_json = metadata_json || $10::jsonb
      where tenant_id = $1
        and source_table = 'marketing_video_jobs'
        and source_id = $2
        and ($4 or $6)
        and status not in ('invoiced', 'paid')
      returning plan_key, customer_charge_cents, user_id
    ),
    failed_charge_cleanup as (
      update public.billing_usage_charges
      set status = 'void', amount_cents = 0,
          last_error = 'Video provider reported generation failure before completion.',
          metadata_json = metadata_json || $10::jsonb,
          updated_at = now()
      where tenant_id = $1
        and source_table = 'marketing_video_jobs'
        and source_id = $2
        and $6
        and status not in ('invoiced', 'paid')
      returning id
    ),
    completed_charge as (
      insert into public.billing_usage_charges (
        tenant_id, plan_key, charge_key, fee_family, description, source_table,
        source_id, amount_cents, status, approved_by_user_id, approved_at, metadata_json
      )
      select $1, plan_key, $11, 'usage_rebilling', 'Managed AI video render',
             'marketing_video_jobs', $2, ceil(customer_charge_cents)::integer,
             'approved', user_id, now(), $10::jsonb
      from usage_update
      where $4
      on conflict (tenant_id, charge_key, source_table, source_id) where source_table is not null and source_id is not null
      do update set amount_cents = excluded.amount_cents, status = 'approved',
                    approved_at = now(), metadata_json = public.billing_usage_charges.metadata_json || excluded.metadata_json,
                    updated_at = now()
      returning id
    )
    update public.marketing_video_jobs
    set status = $3,
        output_url = case when $4 then $5 else output_url end,
        error_message = case when $6 then 'The provider reported that video generation failed.' else null end,
        provider_response_json = provider_response_json || $7::jsonb,
        history_json = history_json || $8::jsonb,
        metadata_json = case when $4 then metadata_json || $9::jsonb else metadata_json end,
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
        note: completed ? "Source footage is rendered. Ferocity is inspecting it before finishing or publishing." : `Provider status: ${result.data.status}.`
      }]),
      JSON.stringify(completed ? {
        productionStatus: "source_render_complete",
        qualityReview: { status: "queued", score: null, inspectedFrames: 0 },
        finishing: {
          status: "waiting_for_quality_review",
          noAdditionalPremiumRender: true,
          note: "Ferocity will try post-production repairs before recommending another paid generation."
        }
      } : {}),
      JSON.stringify({
        providerStatus: result.data.status,
        chargeState: completed ? "approved_after_success" : failed ? "void_provider_failed" : "awaiting_successful_completion"
      }),
      `premium-video:${job.id}`
    ]
  );
  revalidatePath(`/app/marketing-os/video/${job.id}`);
}

export async function createVideoVariationAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = variationSchema.safeParse({
    videoJobId: formData.get("videoJobId"),
    variationInstruction: formData.get("variationInstruction"),
    aspectRatio: formData.get("aspectRatio")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const source = await loadVideoJob(tenantId, parsed.data.videoJobId);
  if (!source) return;

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.marketing_video_jobs (
      tenant_id, brand_id, provider_key, service_label, goal, offer_label, status,
      script_text, scenes_json, voiceover_text, cta_text, provider_request_json,
      history_json, metadata_json
    )
    select
      tenant_id, brand_id, 'provider_not_selected', service_label,
      goal || ' — ' || $3, offer_label, 'needs_review',
      script_text || E'\n\nVariation direction: ' || $3,
      scenes_json, voiceover_text, cta_text,
      provider_request_json || jsonb_build_object(
        'aspectRatios', jsonb_build_array($4::text),
        'variationOf', id,
        'variationInstruction', $3::text,
        'providerReady', false
      ),
      jsonb_build_array(jsonb_build_object(
        'status', 'variation_created',
        'at', now(),
        'note', 'A new review-first variation was created without provider spend.'
      )),
      metadata_json || jsonb_build_object(
        'parentVideoJobId', id,
        'variationInstruction', $3::text,
        'approvalRequired', true,
        'noProviderSubmitted', true,
        'productionStatus', 'ready_for_render_review'
      )
    from public.marketing_video_jobs
    where tenant_id = $1 and id = $2
    returning id
    `,
    [tenantId, source.id, parsed.data.variationInstruction, parsed.data.aspectRatio]
  );
  const variationId = result?.rows[0]?.id;
  if (!variationId) return;
  revalidatePath("/app/marketing-os");
  revalidatePath(`/app/marketing-os/video/${source.id}`);
}
