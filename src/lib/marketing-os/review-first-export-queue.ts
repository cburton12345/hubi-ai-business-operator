import { queryPostgres } from "@/lib/db/postgres";

export type ReviewFirstExportQueueRow = {
  id: string;
  brandId: string | null;
  brandName: string | null;
  exportType: string;
  providerKey: string | null;
  targetLabel: string | null;
  title: string;
  body: string | null;
  status: string;
  riskLevel: string;
  blockedReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type QueueRecord = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  brand_name: string | null;
  export_type: string;
  provider_key: string | null;
  target_label: string | null;
  title: string;
  body: string | null;
  status: string;
  risk_level: string;
  blocked_reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type ProviderRecord = {
  provider_key: string;
  display_name: string | null;
  status: string;
  credentials_status: string | null;
  live_actions_enabled: boolean | null;
};

type ExecutionResult = {
  status: "exported" | "blocked";
  reason: string;
  providerReady: boolean;
};

const manualProviders = new Set(["manual", "manual_export", "provider_not_selected", ""]);
const providerAdaptersReady = new Set<string>([]);

export async function getReviewFirstExportQueue(workspaceId: string) {
  const result = await queryPostgres<QueueRecord>(
    `
    select
      q.id,
      q.tenant_id,
      q.brand_id,
      b.name as brand_name,
      q.export_type,
      q.provider_key,
      q.target_label,
      q.title,
      q.body,
      q.status,
      q.risk_level,
      q.blocked_reason,
      q.metadata_json,
      q.created_at,
      q.updated_at
    from public.review_first_export_queue q
    left join public.brands b on b.tenant_id = q.tenant_id and b.id = q.brand_id
    where q.tenant_id = $1 and q.status <> 'archived'
    order by
      case q.status when 'needs_review' then 1 when 'approved' then 2 when 'blocked' then 3 when 'exported' then 4 else 5 end,
      q.created_at desc
    limit 80
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    exportType: row.export_type,
    providerKey: row.provider_key,
    targetLabel: row.target_label,
    title: row.title,
    body: row.body,
    status: row.status,
    riskLevel: row.risk_level,
    blockedReason: row.blocked_reason,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function approveReviewFirstExportQueueItem(workspaceId: string, itemId: string, userId: string | null, notes?: string) {
  const result = await queryPostgres<QueueRecord>(
    `
    update public.review_first_export_queue
    set status = 'approved',
        approved_by_user_id = $3,
        approved_at = now(),
        blocked_reason = null,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status in ('draft', 'needs_review', 'blocked')
    returning *
    `,
    [
      workspaceId,
      itemId,
      userId,
      JSON.stringify({ approvalNotes: notes ?? "", approvedFrom: "review_first_export_queue" })
    ]
  );
  const item = result?.rows[0];
  if (!item) return null;

  await logQueueEvent(item, "review_export.approved", "Review item approved", notes || "Approved for export or provider run.", userId);
  return item;
}

export async function executeReviewFirstExportQueueItem(workspaceId: string, itemId: string, userId: string | null) {
  const itemResult = await queryPostgres<QueueRecord>(
    `
    select
      q.*,
      b.name as brand_name
    from public.review_first_export_queue q
    left join public.brands b on b.tenant_id = q.tenant_id and b.id = q.brand_id
    where q.tenant_id = $1 and q.id = $2
    limit 1
    `,
    [workspaceId, itemId]
  );
  const item = itemResult?.rows[0];
  if (!item) return null;

  const execution = await resolveExecution(item);
  const status = execution.status;
  const updateResult = await queryPostgres<QueueRecord>(
    `
    update public.review_first_export_queue
    set status = $3,
        exported_at = case when $3 = 'exported' then now() else exported_at end,
        blocked_reason = case when $3 = 'blocked' then $4 else null end,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning *
    `,
    [
      workspaceId,
      itemId,
      status,
      execution.reason,
      JSON.stringify({
        lastExecution: {
          at: new Date().toISOString(),
          byUserId: userId,
          status,
          reason: execution.reason,
          providerReady: execution.providerReady
        }
      })
    ]
  );
  const updated = updateResult?.rows[0];
  if (!updated) return null;

  await logQueueEvent(
    { ...item, status },
    status === "exported" ? "review_export.exported" : "review_export.blocked",
    status === "exported" ? "Review item exported" : "Review item blocked",
    execution.reason,
    userId
  );
  return { item: updated, execution };
}

async function resolveExecution(item: QueueRecord): Promise<ExecutionResult> {
  if (item.status !== "approved") {
    return {
      status: "blocked",
      reason: "Approve this item before Ferocity exports or runs it.",
      providerReady: false
    };
  }

  const providerKey = item.provider_key ?? "";
  if (manualProviders.has(providerKey)) {
    return {
      status: "exported",
      reason: "Export package is ready for manual upload, editing, or handoff. No external provider was called.",
      providerReady: true
    };
  }

  const providerResult = await queryPostgres<ProviderRecord>(
    `
    select provider_key, display_name, status, credentials_status, live_actions_enabled
    from public.provider_accounts
    where tenant_id = $1 and provider_key = $2
    limit 1
    `,
    [item.tenant_id, providerKey]
  );
  const provider = providerResult?.rows[0];

  if (!provider) {
    return {
      status: "blocked",
      reason: `${providerKey} is not connected for this workspace yet.`,
      providerReady: false
    };
  }

  if (provider.status !== "connected" || provider.credentials_status !== "configured" || provider.live_actions_enabled !== true) {
    return {
      status: "blocked",
      reason: `${provider.display_name ?? providerKey} is not live-enabled yet. Connect credentials and turn on live actions first.`,
      providerReady: false
    };
  }

  if (!providerAdaptersReady.has(providerKey)) {
    return {
      status: "blocked",
      reason: `${provider.display_name ?? providerKey} is connected, but this build does not include the live posting adapter yet.`,
      providerReady: false
    };
  }

  return {
    status: "exported",
    reason: `${provider.display_name ?? providerKey} accepted the queued item.`,
    providerReady: true
  };
}

async function logQueueEvent(item: QueueRecord, action: string, title: string, body: string, userId: string | null) {
  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, user_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, $3, 'user', $4, 'review_first_export_queue', $5, $6::jsonb)
    `,
    [
      item.tenant_id,
      item.brand_id,
      userId,
      action,
      item.id,
      JSON.stringify({
        exportType: item.export_type,
        providerKey: item.provider_key,
        status: item.status
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body, visibility,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, 'marketing', $3, $4, $5, 'internal', 'review_first_export_queue', $6, 'review_first_export_queue', $6, $7::jsonb)
    `,
    [
      item.tenant_id,
      item.brand_id,
      action,
      title,
      body,
      item.id,
      JSON.stringify({
        exportType: item.export_type,
        providerKey: item.provider_key,
        targetLabel: item.target_label
      })
    ]
  );
}
