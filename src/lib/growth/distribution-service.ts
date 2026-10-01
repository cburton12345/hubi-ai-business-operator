import { withPostgresTransaction } from "@/lib/db/postgres";
import {
  buildDistributionPlan,
  distributionDestinations,
  nextDistributionRetry,
  type CanonicalPublication,
  type DestinationReadiness,
  type DistributionPlanItem
} from "./canonical-distribution";

type CreateDistributionInput = {
  tenantId: string;
  brandId: string;
  createdByUserId?: string;
  publication: CanonicalPublication;
  destinationKeys: string[] | "all";
  readiness?: Record<string, DestinationReadiness>;
  explicitSpendApproved?: boolean;
};

export type PersistedDistribution = {
  publicationId: string;
  destinations: Array<DistributionPlanItem & { id: string }>;
};

/**
 * Persists a canonical publication and its destination-specific plans.
 * This queues work, but deliberately does not call providers or spend money.
 */
export async function createDistribution(input: CreateDistributionInput): Promise<PersistedDistribution | null> {
  const plan = buildDistributionPlan(input);
  return withPostgresTransaction(async (client) => {
    const publicationResult = await client.query<{ id: string }>(
      `insert into public.distribution_publications
        (tenant_id, brand_id, publication_type, title, body, canonical_payload_json, approval_mode, status,
         campaign_key, scheduled_for, recurrence_rule, created_by_user_id, metadata_json)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13::jsonb)
       returning id`,
      [
        input.tenantId,
        input.brandId,
        input.publication.type,
        input.publication.title,
        input.publication.body,
        JSON.stringify(input.publication),
        input.publication.approvalMode ?? "approval_required",
        publicationStatus(plan),
        input.publication.campaignKey ?? null,
        input.publication.schedule?.publishAt ?? null,
        input.publication.schedule?.recurrenceRule ?? null,
        input.createdByUserId ?? null,
        JSON.stringify({ destinationCount: plan.length, createdBy: "canonical_distribution_engine" })
      ]
    );
    const publicationId = publicationResult.rows[0].id;
    const destinations: PersistedDistribution["destinations"] = [];

    for (const item of plan) {
      const definition = distributionDestinations[item.destinationKey];
      const destinationResult = await client.query<{ id: string }>(
        `insert into public.distribution_destinations
          (tenant_id, publication_id, destination_key, provider_key, distribution_method, status,
           capability_snapshot_json, adapted_payload_json, preview_json, attribution_json, scheduled_for,
           idempotency_key, metadata_json)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb)
         on conflict (tenant_id, idempotency_key) do update set
           adapted_payload_json=excluded.adapted_payload_json,
           preview_json=excluded.preview_json,
           attribution_json=excluded.attribution_json,
           updated_at=now()
         returning id`,
        [
          input.tenantId, publicationId, item.destinationKey, item.providerKey, item.method, item.status,
          JSON.stringify(definition ?? {}), JSON.stringify(item.payload), JSON.stringify(item.preview), JSON.stringify(item.utm),
          input.publication.schedule?.publishAt ?? null, item.idempotencyKey,
          JSON.stringify({ reason: item.reason ?? null, canonicalVersion: 1 })
        ]
      );
      const destinationId = destinationResult.rows[0].id;
      destinations.push({ ...item, id: destinationId });

      if (item.status !== "unsupported" && item.status !== "needs_connection") {
        await client.query(
          `insert into public.publishing_queue
            (tenant_id, brand_id, target_platform, provider_status, queue_status, scheduled_for, metadata_json,
             distribution_publication_id, distribution_destination_id, content_version)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,1)`,
          [
            input.tenantId,
            input.brandId,
            queuePlatform(item.destinationKey),
            item.status === "ready" ? "ready" : "not_connected",
            queueStatus(item),
            input.publication.schedule?.publishAt ?? null,
            JSON.stringify({ method: item.method, providerKey: item.providerKey, idempotencyKey: item.idempotencyKey, reason: item.reason ?? null }),
            publicationId,
            destinationId
          ]
        );
      }
    }
    return { publicationId, destinations };
  });
}

export async function recordDistributionAttempt(input: {
  tenantId: string;
  destinationId: string;
  actionKey?: "publish" | "update" | "pause" | "resume" | "remove" | "refresh_status" | "collect_analytics";
  status: "running" | "succeeded" | "needs_human" | "retry_scheduled" | "failed" | "canceled";
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  providerReference?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  return withPostgresTransaction(async (client) => {
    const destination = await client.query<{ attempt_count: number }>(
      `select attempt_count from public.distribution_destinations where id=$1 and tenant_id=$2 for update`,
      [input.destinationId, input.tenantId]
    );
    if (!destination.rowCount) throw new Error("distribution_destination_not_found");
    const attemptNumber = destination.rows[0].attempt_count + 1;
    const retryAt = input.status === "retry_scheduled" ? nextDistributionRetry(attemptNumber) : null;
    await client.query(
      `insert into public.distribution_attempts
        (tenant_id,destination_id,attempt_number,action_key,status,request_json,response_json,provider_reference,error_code,error_message,retry_at,started_at,completed_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,now(),case when $5='running' then null else now() end)`,
      [input.tenantId, input.destinationId, attemptNumber, input.actionKey ?? "publish", input.status,
        JSON.stringify(input.request ?? {}), JSON.stringify(input.response ?? {}), input.providerReference ?? null,
        input.errorCode ?? null, input.errorMessage ?? null, retryAt]
    );
    await client.query(
      `update public.distribution_destinations set
         attempt_count=$3,
         status=case when $4='succeeded' then 'succeeded' when $4='needs_human' then 'needs_human' when $4 in ('failed','retry_scheduled') then 'failed' else $4 end,
         next_retry_at=$5,
         external_reference=coalesce($6,external_reference),
         last_error_code=$7,
         last_error_message=$8,
         published_at=case when $4='succeeded' then now() else published_at end,
         updated_at=now()
       where id=$1 and tenant_id=$2`,
      [input.destinationId, input.tenantId, attemptNumber, input.status, retryAt, input.providerReference ?? null, input.errorCode ?? null, input.errorMessage ?? null]
    );
    return { attemptNumber, retryAt };
  });
}

function publicationStatus(plan: DistributionPlanItem[]) {
  if (plan.some((item) => item.status === "needs_approval")) return "needs_approval";
  if (plan.some((item) => item.status === "ready")) return "approved";
  return "draft";
}

function queueStatus(item: DistributionPlanItem) {
  if (item.status === "ready") return "approved";
  return "needs_approval";
}

function queuePlatform(destinationKey: string) {
  return distributionDestinations[destinationKey] ? destinationKey : "manual";
}
