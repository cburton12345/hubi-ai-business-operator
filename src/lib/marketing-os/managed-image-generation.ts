import crypto from "node:crypto";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { runApprovedImageGeneration, type ManagedImageDependencies, type ManagedImageJob } from "@/lib/marketing-os/image-generation-runtime";
import { getImageGenerationProvider, getManagedImageConfiguration } from "@/lib/providers/image-adapters";
import { managedImageUsagePersistenceEvidence } from "@/lib/providers/image-usage-cost";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishStorageUpload, reserveStorageUpload } from "@/lib/usage/storage-quota";

type GraphicRow = { id: string; tenant_id: string; brand_id: string | null; status: string; prompt_json: Record<string, unknown> | null; output_media_asset_id: string | null; approval_hash: string | null; approval_version: string | null; approved_by_actor_key: string | null; approved_at: Date | string | null };
const bucket = "marketing-media-assets";

function jobFromRow(row: GraphicRow): ManagedImageJob {
  const prompt = row.prompt_json && typeof row.prompt_json === "object" ? row.prompt_json : {};
  return { id: row.id, tenantId: row.tenant_id, brandId: row.brand_id, status: row.status, prompt: typeof prompt.prompt === "string" ? prompt.prompt : "", size: typeof prompt.size === "string" ? prompt.size : "1024x1024", sourceAssets: Array.isArray(prompt.sourceAssets) ? prompt.sourceAssets.filter((value): value is string => typeof value === "string") : [], outputAssetId: row.output_media_asset_id, approvalHash: row.approval_hash, approvalVersion: row.approval_version, approvedByActorKey: row.approved_by_actor_key, approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at, approvalInputJson: prompt };
}

async function loadJob(tenantId: string, jobId: string) {
  const result = await queryPostgres<GraphicRow>(`select id,tenant_id,brand_id,status,prompt_json,output_media_asset_id,approval_hash,approval_version,approved_by_actor_key,approved_at from public.marketing_graphic_jobs where tenant_id=$1 and id=$2 and job_type='image_ad' limit 1`, [tenantId, jobId], "managed-image-load");
  return result.rows[0] ? jobFromRow(result.rows[0]) : null;
}

export function managedImageApprovalSnapshot(job: ManagedImageJob, configuration: NonNullable<ReturnType<typeof getManagedImageConfiguration>>) {
  return { version: 1, tenantId: job.tenantId, jobId: job.id, brandId: job.brandId, prompt: job.prompt.trim(), size: job.size, sourceAssets: job.sourceAssets, providerKey: configuration.providerKey, model: configuration.model, maximumProviderCostReservationCents: configuration.providerCostCentsPerImage, proposedCustomerChargeCents: configuration.customerPriceCentsPerImage, billingContractCertified: env.IMAGE_BILLING_CONTRACT_CERTIFIED?.toLowerCase() === "true" };
}

export function managedImageApprovalHash(snapshot: ReturnType<typeof managedImageApprovalSnapshot>) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function managedImageExecutionModeAllowsApprovedJob(mode: string) {
  return mode === "review_required" || mode === "enabled";
}

export function managedImageAttemptIdentity(jobId: string, providerKey: string, occurredAt: Date, attemptId: string) {
  const billingPeriod = occurredAt.toISOString().slice(0, 7);
  return { billingPeriod, idempotencyKey: `managed-image:${jobId}:${providerKey}:${billingPeriod}:${attemptId}` };
}

export async function approveManagedImageAd(input: { tenantId: string; jobId: string; actorKey: string }) {
  const configuration = getManagedImageConfiguration();
  if (!configuration) return false;
  const job = await loadJob(input.tenantId, input.jobId);
  if (!job || !["needs_review", "failed"].includes(job.status)) return false;
  const snapshot = managedImageApprovalSnapshot(job, configuration);
  const result = await queryPostgres<{ id: string }>(`with eligible_brand as materialized (select id from public.brands where tenant_id=$1 and id=$8::uuid and status<>'archived' for share) update public.marketing_graphic_jobs set status='approved',approval_snapshot_json=$3::jsonb,approval_hash=$4,approval_version=$5,approved_by_actor_key=$6,approved_at=now(),error_message=null,updated_at=now() where tenant_id=$1 and id=$2 and job_type='image_ad' and status in ('needs_review','failed') and prompt_json=$7::jsonb and brand_id is not distinct from $8::uuid and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id)) returning id`, [input.tenantId, input.jobId, JSON.stringify(snapshot), managedImageApprovalHash(snapshot), crypto.randomUUID(), input.actorKey, JSON.stringify(job.approvalInputJson ?? {}), job.brandId], "managed-image-approve");
  return Boolean(result.rows[0]);
}

export async function generateManagedImageAd(input: { tenantId: string; jobId: string; userId: string | null }) {
  const [gate, configuration] = await Promise.all([getServiceGate(input.tenantId, "marketing_graphics"), Promise.resolve(getManagedImageConfiguration())]);
  const subscription = await queryPostgres<{ plan_key: string | null; status: string; external_customer_ref: string | null }>(`select t.plan_key,s.status,s.external_customer_ref from public.tenants t left join public.billing_subscriptions s on s.tenant_id=t.id where t.id=$1 limit 1`, [input.tenantId], "managed-image-billing-read");
  const billing = subscription.rows[0];
  const ready = gate.enabled && managedImageExecutionModeAllowsApprovedJob(gate.mode) && configuration && env.IMAGE_BILLING_CONTRACT_CERTIFIED?.toLowerCase() === "true" && env.FEROCITY_USAGE_BILLING_ENABLED?.toLowerCase() === "true" && billing?.external_customer_ref && ["active", "trialing"].includes(billing.status);
  const provider = ready && configuration ? getImageGenerationProvider(configuration.providerKey) : null;

  const dependencies: ManagedImageDependencies = {
    configuration: ready && configuration ? configuration : null,
    provider,
    loadJob,
    async claimJob(job) {
      const result = await queryPostgres<{ id: string }>(`with eligible_brand as materialized (select id from public.brands where tenant_id=$1 and id=$5::uuid and status<>'archived' for share) update public.marketing_graphic_jobs set status='processing',submitted_at=now(),error_message=null,updated_at=now() where tenant_id=$1 and id=$2 and status in ('approved','failed') and approval_hash=$3 and approval_version=$4 and brand_id is not distinct from $5::uuid and (brand_id is null or exists(select 1 from eligible_brand where id=brand_id)) returning id`, [job.tenantId, job.id, job.approvalHash, job.approvalVersion, job.brandId], "managed-image-claim");
      return Boolean(result.rows[0]);
    },
    async reserveBudget(job) {
      if (!configuration || !billing) return null;
      const attemptId = crypto.randomUUID();
      const { billingPeriod, idempotencyKey: key } = managedImageAttemptIdentity(job.id, configuration.providerKey, new Date(), attemptId);
      const result = await queryPostgres<{ id: string }>(`
        with budget_lock as (select pg_advisory_xact_lock(hashtext('ferocity:managed-image'))), usage as (
          select coalesce(sum(provider_cost_cents),0) global_cost,coalesce(sum(provider_cost_cents) filter(where tenant_id=$1),0) workspace_cost
          from public.usage_meter_events,budget_lock where feature_key='managed_image_ad' and occurred_at>=date_trunc('month',now()) and status not in ('void','failed')
        )
        insert into public.usage_meter_events(tenant_id,brand_id,user_id,plan_key,feature_key,provider_key,source_table,source_id,unit_type,quantity,provider_cost_cents,customer_charge_cents,status,source,idempotency_key,metadata_json)
        select $1,$2,$3,$4,'managed_image_ad',$5,'marketing_graphic_jobs',$6,'image',1,$7,$8,'pending_review','system',$9,$10::jsonb from usage
        where usage.global_cost+$7<=$11 and usage.workspace_cost+$7<=$12
        on conflict(tenant_id,idempotency_key) do nothing
        returning id`, [input.tenantId, job.brandId, input.userId, billing.plan_key, configuration.providerKey, job.id, configuration.providerCostCentsPerImage, configuration.customerPriceCentsPerImage, key, JSON.stringify({ approvedByCustomer: true, model: configuration.model, attemptId, billingPeriod }), configuration.globalMonthlyBudgetCents, configuration.workspaceMonthlyBudgetCents]);
      return result.rows[0] ? { id: result.rows[0].id, idempotencyKey: key } : null;
    },
    async isCancelled(tenantId, jobId) {
      const result = await queryPostgres<{ status: string }>(`select status from public.marketing_graphic_jobs where tenant_id=$1 and id=$2 limit 1`, [tenantId, jobId]);
      return result.rows[0]?.status === "cancelled";
    },
    async approvalMatches(job) {
      if (!configuration || !job.approvalHash) return false;
      return job.approvalHash === managedImageApprovalHash(managedImageApprovalSnapshot(job, configuration));
    },
    async storeOutput({ job, bytes, reservationId, providerRequestId, usage }) {
      const supabase = createSupabaseAdminClient();
      if (!supabase) throw new Error("Private media storage is unavailable.");
      const assetId = crypto.randomUUID();
      const path = `${job.tenantId}/${job.id}/${assetId}.png`;
      const storageEventId = await reserveStorageUpload({ tenantId: job.tenantId, bucket, storageKey: path, sourceType: "managed_image_ad", sourceId: job.id, byteCount: bytes.byteLength, idempotencyKey: `managed-image-storage:${reservationId}`, metadata: { assetId, mimeType: "image/png", reservationId } });
      if (!storageEventId) throw new Error("Workspace storage limit exceeded.");
      const upload = await supabase.storage.from(bucket).upload(path, bytes, { contentType: "image/png", upsert: false });
      if (upload.error) { await finishStorageUpload(storageEventId, "failed", { category: "storage_upload_failed" }); throw new Error("Image storage failed."); }
      await finishStorageUpload(storageEventId, "active");
      const usageEvidence = managedImageUsagePersistenceEvidence({ usage, model: configuration?.model ?? "unknown", size: job.size });
      const saved = await queryPostgres<{ id: string }>(`
        with eligible as (
          select id from public.marketing_graphic_jobs where tenant_id=$2 and id=$11 and status='processing' for update
        ), asset as (
          insert into public.marketing_media_assets(id,tenant_id,brand_id,asset_type,title,storage_bucket,storage_path,approved_for_ai_reuse,permission_status,status,metadata_json)
          select $1,$2,$3,'photo','Generated image advertisement',$4,$5,false,'needs_review','needs_review',$6::jsonb from eligible returning id
        ), usage_update as (
          update public.usage_meter_events set status='pending_review',provider_resource_id=$7,provider_event_id=$7,metadata_json=metadata_json||$8::jsonb where tenant_id=$2 and id=$9 and exists(select 1 from eligible) returning id
        )
        update public.marketing_graphic_jobs set status='generated',provider_key='openai_image',output_media_asset_id=$1,output_assets_json=jsonb_build_array(jsonb_build_object('assetId',$1,'storageBucket',$4,'storagePath',$5,'status','needs_review')),provider_response_json=$10::jsonb,error_message=null,completed_at=now(),updated_at=now()
        where tenant_id=$2 and id=$11 and status='processing' and exists(select 1 from asset) and exists(select 1 from usage_update) returning id`, [assetId, job.tenantId, job.brandId, bucket, path, JSON.stringify({ source: "managed_image_ad", graphicJobId: job.id }), providerRequestId ?? null, JSON.stringify({ providerCostReconciliation: usageEvidence.reconciliation, customerBillingState: "not_created", usageEvidence }), reservationId, JSON.stringify({ providerRequestId: providerRequestId ?? null, persisted: true, billingState: "unreconciled" }), job.id]);
      if (!saved.rows[0]) {
        await queryPostgres(`update public.marketing_graphic_jobs set provider_response_json=provider_response_json||$3::jsonb,error_message='Generated output requires reconciliation before any retry.',updated_at=now() where tenant_id=$1 and id=$2`, [job.tenantId, job.id, JSON.stringify({ reconciliationRequired: true, storageBucket: bucket, storagePath: path, storageEventId, providerRequestId: providerRequestId ?? null })], "managed-image-reconciliation-evidence");
        throw new Error("Image database persistence requires reconciliation.");
      }
      return { assetId };
    },
    async markFailure({ job, reservationId, status, reason, voidReservation }) {
      if (reservationId) await queryPostgres(`update public.usage_meter_events set status=$3,provider_cost_cents=case when $4 then 0 else provider_cost_cents end,customer_charge_cents=case when $4 then 0 else customer_charge_cents end,metadata_json=metadata_json||$5::jsonb where tenant_id=$1 and id=$2`, [job.tenantId, reservationId, voidReservation ? "failed" : "pending_review", voidReservation, JSON.stringify({ outcome: status, safeMessage: reason })]);
      await queryPostgres(`update public.marketing_graphic_jobs set status=$3,error_message=$4,provider_response_json=provider_response_json||$5::jsonb,updated_at=now() where tenant_id=$1 and id=$2 and status<>'cancelled'`, [job.tenantId, job.id, status, reason.slice(0,500), JSON.stringify({ outcome: status, reviewedAt: new Date().toISOString() })]);
    }
  };
  return runApprovedImageGeneration({ tenantId: input.tenantId, jobId: input.jobId }, dependencies);
}

export async function cancelManagedImageAd(tenantId: string, jobId: string) {
  const result = await queryPostgres<{ id: string }>(`update public.marketing_graphic_jobs set status='cancelled',cancelled_at=now(),error_message=null,updated_at=now() where tenant_id=$1 and id=$2 and job_type='image_ad' and status in ('draft','needs_review','approved','failed','unknown','processing') returning id`, [tenantId, jobId]);
  return Boolean(result.rows[0]);
}
