import { queryPostgres } from "@/lib/db/postgres";

export async function reserveStorageUpload(input: {
  tenantId: string;
  bucket: string;
  storageKey: string;
  sourceType: string;
  sourceId?: string | null;
  byteCount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ event_id: string | null }>(
    `
    select public.reserve_storage_usage(
      $1::uuid, $2, $3, $4, nullif($5, ''), $6::bigint, $7, $8::jsonb
    ) as event_id
    `,
    [
      input.tenantId,
      input.bucket,
      input.storageKey,
      input.sourceType,
      input.sourceId ?? "",
      Math.max(0, Math.round(input.byteCount)),
      input.idempotencyKey,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result?.rows[0]?.event_id ?? null;
}

export async function finishStorageUpload(eventId: string, status: "active" | "failed", metadata: Record<string, unknown> = {}) {
  await queryPostgres(
    `
    update public.storage_usage_events
    set status = $2,
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where id = $1 and status = 'reserved'
    `,
    [eventId, status, JSON.stringify(metadata)]
  );
}
