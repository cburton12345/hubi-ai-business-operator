import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import type { CallHandlingStrategy, CallPriorityClass } from "./call-management";

export type CallManagementMode = {
  id: string;
  modeKey: string;
  displayName: string;
  description: string;
  handlingStrategy: CallHandlingStrategy;
  transferCategories: CallPriorityClass[];
  minimumTransferScore: number;
  minimumSalesValueCents: number;
  isDefault: boolean;
  isCustom: boolean;
};

export async function getCallManagementDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const [modeResult, stateResult, metricResult] = await Promise.all([
    queryPostgres<{
      id: string;
      mode_key: string;
      display_name: string;
      description: string;
      handling_strategy: CallHandlingStrategy;
      transfer_categories_json: CallPriorityClass[];
      minimum_transfer_score: number;
      minimum_sales_value_cents: number;
      is_default: boolean;
      is_custom: boolean;
    }>(
      `select id, mode_key, display_name, description, handling_strategy,
         transfer_categories_json, minimum_transfer_score, minimum_sales_value_cents,
         is_default, is_custom
       from public.call_handling_modes
       where tenant_id=$1 and brand_id is null and status='active'
       order by is_default desc, is_custom asc, created_at asc`,
      [tenantId]
    ),
    queryPostgres<{ state_key: string; expires_at: Date | string | null }>(
      `select state_key, expires_at from public.owner_attention_states
       where tenant_id=$1 and status='active' and starts_at <= now()
         and (expires_at is null or expires_at > now())
       order by starts_at desc limit 1`,
      [tenantId]
    ),
    queryPostgres<{ waiting: string; handled_by_ai: string; interruptions_avoided: string }>(
      `select
         count(*) filter (where status in ('pending','presented') and should_interrupt_owner)::text as waiting,
         count(*) filter (where decision='ai_handle')::text as handled_by_ai,
         count(*) filter (where decision='ai_handle' and metadata_json->>'attentionState' <> 'available')::text as interruptions_avoided
       from public.call_management_decisions
       where tenant_id=$1 and created_at >= now() - interval '30 days'`,
      [tenantId]
    )
  ]);

  const metric = metricResult?.rows[0];
  return {
    modes: (modeResult?.rows ?? []).map((row): CallManagementMode => ({
      id: row.id,
      modeKey: row.mode_key,
      displayName: row.display_name,
      description: row.description,
      handlingStrategy: row.handling_strategy,
      transferCategories: row.transfer_categories_json ?? [],
      minimumTransferScore: Number(row.minimum_transfer_score),
      minimumSalesValueCents: Number(row.minimum_sales_value_cents),
      isDefault: row.is_default,
      isCustom: row.is_custom
    })),
    attentionState: stateResult?.rows[0]?.state_key ?? "available",
    attentionExpiresAt: stateResult?.rows[0]?.expires_at
      ? new Date(stateResult.rows[0].expires_at!).toISOString()
      : null,
    metrics: {
      waiting: Number(metric?.waiting ?? 0),
      handledByAi: Number(metric?.handled_by_ai ?? 0),
      interruptionsAvoided: Number(metric?.interruptions_avoided ?? 0)
    }
  };
}
