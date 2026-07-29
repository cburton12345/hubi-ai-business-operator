import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type JsonRecord = Record<string, unknown>;

export type VideoAdBrief = {
  id: string;
  providerKey: string;
  serviceLabel: string | null;
  goal: string | null;
  offerLabel: string | null;
  status: string;
  scriptText: string | null;
  scenes: JsonRecord[];
  voiceoverText: string | null;
  ctaText: string | null;
  providerRequest: JsonRecord;
  providerResponse: JsonRecord;
  history: JsonRecord[];
  outputUrl: string | null;
  errorMessage: string | null;
  metadata: JsonRecord;
  brandName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export async function getVideoAdBrief(videoJobId: string): Promise<VideoAdBrief | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    provider_key: string;
    service_label: string | null;
    goal: string | null;
    offer_label: string | null;
    status: string;
    script_text: string | null;
    scenes_json: unknown;
    voiceover_text: string | null;
    cta_text: string | null;
    provider_request_json: unknown;
    provider_response_json: unknown;
    history_json: unknown;
    output_url: string | null;
    error_message: string | null;
    metadata_json: unknown;
    brand_name: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    select
      v.id,
      v.provider_key,
      v.service_label,
      v.goal,
      v.offer_label,
      v.status,
      v.script_text,
      v.scenes_json,
      v.voiceover_text,
      v.cta_text,
      v.provider_request_json,
      v.provider_response_json,
      v.history_json,
      v.output_url,
      v.error_message,
      v.metadata_json,
      b.name as brand_name,
      v.created_at,
      v.updated_at
    from public.marketing_video_jobs v
    left join public.brands b on b.id = v.brand_id and b.tenant_id = v.tenant_id
    where v.tenant_id = $1 and v.id = $2
    limit 1
    `,
    [workspaceId, videoJobId]
  );

  const row = result?.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    providerKey: row.provider_key,
    serviceLabel: row.service_label,
    goal: row.goal,
    offerLabel: row.offer_label,
    status: row.status,
    scriptText: row.script_text,
    scenes: asRecordArray(row.scenes_json),
    voiceoverText: row.voiceover_text,
    ctaText: row.cta_text,
    providerRequest: asRecord(row.provider_request_json),
    providerResponse: asRecord(row.provider_response_json),
    history: asRecordArray(row.history_json),
    outputUrl: row.output_url,
    errorMessage: row.error_message,
    metadata: asRecord(row.metadata_json),
    brandName: row.brand_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
