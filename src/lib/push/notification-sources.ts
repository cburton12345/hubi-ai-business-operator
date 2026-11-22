import { queryPostgres } from "@/lib/db/postgres";
import type { PushRiskType, PushSeverity } from "@/lib/push/preferences";

export const notificationSourceTypes = [
  "owner_event",
  "ai_work",
  "approval",
  "provider_request",
  "funding_alert",
  "marketing_recommendation",
] as const;

export type NotificationSourceType = (typeof notificationSourceTypes)[number];

export type NotificationSourceRecord = {
  id: string;
  source: NotificationSourceType;
  title: string;
  body: string;
  severity: PushSeverity;
  status: string;
  actionUrl: string;
  sourceUpdatedAt: string;
  ownerAttention: boolean;
  moneyCents: number;
  riskType: PushRiskType | null;
};

type SourceRow = {
  id: string;
  title: string;
  body: string;
  severity: PushSeverity;
  status: string;
  action_url: string;
  source_updated_at: Date;
  owner_attention: boolean;
  money_cents: number;
  risk_type: PushRiskType | null;
};

function mapRow(source: NotificationSourceType, row: SourceRow): NotificationSourceRecord {
  return {
    id: row.id,
    source,
    title: row.title,
    body: row.body,
    severity: row.severity,
    status: row.status,
    actionUrl: row.action_url,
    sourceUpdatedAt: row.source_updated_at.toISOString(),
    ownerAttention: row.owner_attention,
    moneyCents: Number(row.money_cents ?? 0),
    riskType: row.risk_type,
  };
}

export async function getActiveNotificationSource(
  tenantId: string,
  source: NotificationSourceType,
  sourceId: string,
): Promise<NotificationSourceRecord | null> {
  let sql: string;

  switch (source) {
    case "owner_event":
      sql = `
        select id::text, title, summary as body, severity, status,
               coalesce(nullif(action_href, ''), '/app/owner-command-center') as action_url,
               updated_at as source_updated_at, owner_attention, money_cents, risk_type
        from public.owner_command_events
        where tenant_id = $1 and id = $2::uuid and status <> 'archived'
          and (occurred_at >= now() - interval '90 days' or status in ('open','needs_owner','critical','watching'))
        limit 1`;
      break;
    case "ai_work":
      sql = `
        select notification.*
        from (
          select o.id::text, o.title,
                 case
                   when o.status = 'needs_review' then 'An AI employee prepared this work and needs your decision before it continues.'
                   when o.status in ('blocked','failed') then 'An AI employee could not finish this work. Open it to see the blocker and next step.'
                   when o.status = 'sent' then 'An AI employee completed and sent this authorized work.'
                   else 'An AI employee prepared this work inside Ferocity.'
                 end as body,
                 case when o.status in ('blocked','failed') then 'high' when o.status = 'needs_review' then 'medium' when o.status = 'sent' then 'low' else 'info' end as severity,
                 o.status,
                 case when o.run_id is null then '/app/ai-workforce' else '/app/ai-workforce/results/' || o.run_id::text end as action_url,
                 o.created_at as source_updated_at,
                 (o.status in ('needs_review','blocked','failed')) as owner_attention,
                 0::integer as money_cents,
                 'automation'::text as risk_type
          from public.ai_agent_outputs o
          where o.tenant_id = $1 and o.id = $2::uuid
            and o.status in ('prepared','needs_review','sent','blocked','failed')
            and o.created_at >= now() - interval '30 days'
          union all
          select r.id::text,
                 replace(r.agent_key, '_', ' ') || case when r.status = 'failed' then ' failed' else ' completed' end,
                 coalesce(nullif(r.summary, ''), nullif(r.error_message, ''), 'The AI employee run finished without a written summary.'),
                 case when r.status = 'failed' then 'high' else 'info' end,
                 r.status,
                 '/app/ai-workforce/results/' || r.id::text,
                 coalesce(r.completed_at, r.created_at),
                 (r.status = 'failed'),
                 0::integer,
                 'automation'::text
          from public.ai_agent_runs r
          where r.tenant_id = $1 and r.id = $2::uuid and r.status in ('completed','failed')
            and coalesce(r.completed_at, r.created_at) >= now() - interval '30 days'
            and not exists (select 1 from public.ai_agent_outputs output where output.run_id = r.id)
        ) notification
        limit 1`;
      break;
    case "approval":
      sql = `
        select id::text, 'Approval needed: ' || replace(target_type, '_', ' ') as title,
               coalesce(nullif(notes, ''), 'Ferocity prepared work that needs a decision before it can continue.') as body,
               risk_level as severity, status, '/app/approvals'::text as action_url,
               created_at as source_updated_at, true as owner_attention, 0::integer as money_cents,
               'approval'::text as risk_type
        from public.approvals
        where tenant_id = $1 and id = $2::uuid and status = 'pending'
        limit 1`;
      break;
    case "provider_request":
      sql = `
        select id::text, 'Provider request: ' || provider_name as title,
               'Ferocity recorded this ' || replace(capability_category, '_', ' ') || ' connection request and will keep its status here.' as body,
               case when currently_using then 'high' else 'medium' end as severity,
               status, '/app/integrations#request-provider'::text as action_url,
               updated_at as source_updated_at, currently_using as owner_attention, 0::integer as money_cents,
               'automation'::text as risk_type
        from public.provider_integration_requests
        where tenant_id = $1 and id = $2::uuid and status not in ('available','declined')
        limit 1`;
      break;
    case "funding_alert":
      sql = `
        select id::text, title, summary as body, severity, status,
               coalesce(nullif(action_href, ''), '/app/provider-costs') as action_url,
               updated_at as source_updated_at, true as owner_attention, 0::integer as money_cents,
               'financial'::text as risk_type
        from public.provider_funding_alerts
        where tenant_id = $1 and id = $2::uuid and status = 'active'
        limit 1`;
      break;
    case "marketing_recommendation":
      sql = `
        select id::text, title, trigger_reason as body,
               case when source_signals_json->>'claimAllowed' = 'storm_related_demand_is_rising' then 'high' else 'medium' end as severity,
               status, '/app/marketing-os'::text as action_url,
               updated_at as source_updated_at, false as owner_attention, 0::integer as money_cents,
               'revenue'::text as risk_type
        from public.marketing_campaign_recommendations
        where tenant_id = $1 and id = $2::uuid
          and metadata_json->>'createdByAgent' = 'weather_demand_monitor'
          and status not in ('dismissed','paused') and updated_at >= now() - interval '14 days'
        limit 1`;
      break;
  }

  const result = await queryPostgres<SourceRow>(sql, [tenantId, sourceId]);
  if (!result) throw new Error("Notification source lookup failed.");
  const row = result.rows[0];
  return row ? mapRow(source, row) : null;
}
