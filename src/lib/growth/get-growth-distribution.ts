import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getChannelCapabilityProfile, growthChannels } from "./distribution-engine";

export type GrowthDistributionDashboard = {
  brands: Array<{ id: string; name: string }>;
  objectives: Array<{ id: string; brandName: string; name: string; serviceFocus: string | null; geography: string; targetLeads: number | null; targetRevenueCents: number | null; timeHorizonDays: number; autonomyLevel: string; status: string }>;
  identities: Array<{ id: string; brandName: string; channelKey: string; displayName: string; identityRole: string; connectionMode: string; authorizationStatus: string; autonomyLevel: string; riskState: string; verificationStatus: string; lastSuccessAt: string | null; lastFailureAt: string | null; recentActions: number; recentWarnings: number }>;
  communities: Array<{ id: string; brandName: string; channelKey: string; name: string; relevanceScore: number; postingPolicy: string; status: string; rulesCheckedAt: string | null }>;
  opportunities: Array<{ id: string; brandName: string; channelKey: string; bodyExcerpt: string; detectedIntent: string; serviceFocus: string | null; geographyText: string | null; overallScore: number; status: string; suggestedResponse: string | null; sourceUrl: string | null; leadId: string | null }>;
  actionHealth: Array<{ riskState: string; count: number }>;
  weeklySummary: { opportunities: number; actions: number; conversations: number; leads: number; estimates: number; pipelineCents: number; wonRevenueCents: number };
  needsAttention: { pendingApprovals: number; verificationRequired: number; restrictedIdentities: number; connectorWarnings: number };
  channelCatalog: Array<{ key: string; label: string; providerKey: string; mode: string; note: string; capabilities: string[]; unsupported: string[]; authentication: string[]; inboundEvents: string[]; approval: string; riskConstraints: string[] }>;
};

export async function getGrowthDistributionDashboard(): Promise<GrowthDistributionDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [brands, objectives, identities, communities, opportunities, actionHealth, summary, attention] = await Promise.all([
    queryPostgres<{ id: string; name: string }>(`select id, name from public.brands where tenant_id = $1 and status = 'active' order by name`, [workspaceId]),
    queryPostgres<{
      id: string; brand_name: string; name: string; service_focus: string | null; geography_json: Record<string, unknown>;
      target_leads: number | null; target_revenue_cents: number | null; time_horizon_days: number; autonomy_level: string; status: string;
    }>(`
      select o.id, b.name as brand_name, o.name, o.service_focus, o.geography_json, o.target_leads,
        o.target_revenue_cents, o.time_horizon_days, o.autonomy_level, o.status
      from public.growth_objectives o join public.brands b on b.id = o.brand_id
      where o.tenant_id = $1 and o.status <> 'archived'
      order by case o.status when 'active' then 1 when 'draft' then 2 else 3 end, o.updated_at desc limit 20
    `, [workspaceId]),
    queryPostgres<{
      id: string; brand_name: string; channel_key: string; display_name: string; identity_role: string; connection_mode: string;
      authorization_status: string; autonomy_level: string; risk_state: string; verification_status: string;
      last_success_at: string | null; last_failure_at: string | null; recent_actions: string; recent_warnings: string;
    }>(`
      select i.id, b.name as brand_name, i.channel_key, i.display_name, i.identity_role, i.connection_mode, i.authorization_status,
        i.autonomy_level, i.risk_state, i.verification_status, i.last_success_at, i.last_failure_at,
        (select count(*)::text from public.growth_action_attempts a where a.tenant_id = i.tenant_id and a.identity_id = i.id and a.created_at >= now() - interval '7 days') as recent_actions,
        (select count(*)::text from public.growth_events e where e.tenant_id = i.tenant_id and e.identity_id = i.id and e.event_type in ('connector_warning','connector_failure','verification_detected','restriction_detected') and e.occurred_at >= now() - interval '30 days') as recent_warnings
      from public.growth_distribution_identities i join public.brands b on b.id = i.brand_id
      where i.tenant_id = $1 order by i.updated_at desc limit 30
    `, [workspaceId]),
    queryPostgres<{
      id: string; brand_name: string; channel_key: string; name: string; relevance_score: number;
      posting_policy: string; status: string; rules_checked_at: string | null;
    }>(`
      select c.id, b.name as brand_name, c.channel_key, c.name, c.relevance_score, c.posting_policy, c.status, c.rules_checked_at
      from public.growth_communities c join public.brands b on b.id = c.brand_id
      where c.tenant_id = $1 and c.status <> 'archived' order by c.relevance_score desc, c.updated_at desc limit 30
    `, [workspaceId]),
    queryPostgres<{
      id: string; brand_name: string; channel_key: string; body_excerpt: string; detected_intent: string;
      service_focus: string | null; geography_text: string | null; overall_score: number; status: string;
      suggested_response: string | null; source_url: string | null; lead_id: string | null;
    }>(`
      select o.id, b.name as brand_name, o.channel_key, o.body_excerpt, o.detected_intent, o.service_focus,
        o.geography_text, o.overall_score, o.status, o.suggested_response, o.source_url, o.lead_id
      from public.growth_opportunities o join public.brands b on b.id = o.brand_id
      where o.tenant_id = $1 and o.status not in ('dismissed', 'expired')
      order by o.overall_score desc, o.detected_at desc limit 30
    `, [workspaceId]),
    queryPostgres<{ risk_state: string; count: string }>(`
      select risk_state, count(*)::text as count from public.growth_action_attempts
      where tenant_id = $1 and created_at >= now() - interval '30 days' group by risk_state order by risk_state
    `, [workspaceId]),
    queryPostgres<{ opportunities: string; actions: string; conversations: string; leads: string; estimates: string; pipeline_cents: string; won_revenue_cents: string }>(`
      select
        (select count(*)::text from public.growth_opportunities where tenant_id = $1 and detected_at >= date_trunc('week', now())) as opportunities,
        (select count(*)::text from public.growth_action_attempts where tenant_id = $1 and created_at >= date_trunc('week', now())) as actions,
        (select count(distinct conversation_id)::text from public.growth_events where tenant_id = $1 and conversation_id is not null and occurred_at >= date_trunc('week', now())) as conversations,
        (select count(distinct lead_id)::text from public.growth_attribution_touches where tenant_id = $1 and lead_id is not null and occurred_at >= date_trunc('week', now())) as leads,
        (select count(distinct estimate_id)::text from public.growth_attribution_touches where tenant_id = $1 and estimate_id is not null and occurred_at >= date_trunc('week', now())) as estimates,
        (select coalesce(sum(pipeline_value_cents),0)::text from public.growth_attribution_touches where tenant_id = $1 and estimate_id is not null and job_id is null and invoice_id is null and occurred_at >= date_trunc('week', now())) as pipeline_cents,
        (select coalesce(sum(won_revenue_cents),0)::text from public.growth_attribution_touches where tenant_id = $1 and invoice_id is not null and occurred_at >= date_trunc('week', now())) as won_revenue_cents
    `, [workspaceId]),
    queryPostgres<{ pending_approvals: string; verification_required: string; restricted_identities: string; connector_warnings: string }>(`
      select
        (select count(*)::text from public.approvals where tenant_id = $1 and target_type = 'growth_action' and status = 'pending') as pending_approvals,
        (select count(*)::text from public.growth_distribution_identities where tenant_id = $1 and risk_state = 'verification_required') as verification_required,
        (select count(*)::text from public.growth_distribution_identities where tenant_id = $1 and risk_state in ('restricted','disabled')) as restricted_identities,
        (select count(*)::text from public.growth_events where tenant_id = $1 and event_type in ('connector_warning','connector_failure') and occurred_at >= now() - interval '7 days') as connector_warnings
    `, [workspaceId])
  ]);

  return {
    brands: brands?.rows ?? [],
    objectives: (objectives?.rows ?? []).map((row) => ({
      id: row.id, brandName: row.brand_name, name: row.name, serviceFocus: row.service_focus,
      geography: Object.values(row.geography_json ?? {}).filter((value) => typeof value === "string").join(", ") || "Any configured service area",
      targetLeads: row.target_leads, targetRevenueCents: row.target_revenue_cents, timeHorizonDays: row.time_horizon_days,
      autonomyLevel: row.autonomy_level, status: row.status
    })),
    identities: (identities?.rows ?? []).map((row) => ({
      id: row.id, brandName: row.brand_name, channelKey: row.channel_key, displayName: row.display_name, identityRole: row.identity_role,
      connectionMode: row.connection_mode, authorizationStatus: row.authorization_status, autonomyLevel: row.autonomy_level,
      riskState: row.risk_state, verificationStatus: row.verification_status, lastSuccessAt: row.last_success_at, lastFailureAt: row.last_failure_at,
      recentActions: Number(row.recent_actions), recentWarnings: Number(row.recent_warnings)
    })),
    communities: (communities?.rows ?? []).map((row) => ({
      id: row.id, brandName: row.brand_name, channelKey: row.channel_key, name: row.name, relevanceScore: row.relevance_score,
      postingPolicy: row.posting_policy, status: row.status, rulesCheckedAt: row.rules_checked_at
    })),
    opportunities: (opportunities?.rows ?? []).map((row) => ({
      id: row.id, brandName: row.brand_name, channelKey: row.channel_key, bodyExcerpt: row.body_excerpt,
      detectedIntent: row.detected_intent, serviceFocus: row.service_focus, geographyText: row.geography_text,
      overallScore: row.overall_score, status: row.status, suggestedResponse: row.suggested_response,
      sourceUrl: row.source_url, leadId: row.lead_id
    })),
    actionHealth: (actionHealth?.rows ?? []).map((row) => ({ riskState: row.risk_state, count: Number(row.count) })),
    weeklySummary: {
      opportunities: Number(summary?.rows[0]?.opportunities ?? 0), actions: Number(summary?.rows[0]?.actions ?? 0),
      conversations: Number(summary?.rows[0]?.conversations ?? 0), leads: Number(summary?.rows[0]?.leads ?? 0),
      estimates: Number(summary?.rows[0]?.estimates ?? 0), pipelineCents: Number(summary?.rows[0]?.pipeline_cents ?? 0),
      wonRevenueCents: Number(summary?.rows[0]?.won_revenue_cents ?? 0)
    },
    needsAttention: {
      pendingApprovals: Number(attention?.rows[0]?.pending_approvals ?? 0), verificationRequired: Number(attention?.rows[0]?.verification_required ?? 0),
      restrictedIdentities: Number(attention?.rows[0]?.restricted_identities ?? 0), connectorWarnings: Number(attention?.rows[0]?.connector_warnings ?? 0)
    },
    channelCatalog: Object.entries(growthChannels).map(([key, channel]) => {
      const profile = getChannelCapabilityProfile(key);
      return ({
      key, label: channel.label, providerKey: channel.providerKey, mode: channel.defaultMode, note: channel.note,
      capabilities: Object.entries(channel.capabilities).filter(([, support]) => support !== "unavailable").map(([capability, support]) => `${capability}: ${support}`),
      unsupported: profile?.unsupportedCapabilities ?? [], authentication: profile?.authenticationRequirements ?? [],
      inboundEvents: profile?.inboundEvents ?? [], approval: profile?.approvalRequirement ?? "always",
      riskConstraints: profile?.riskConstraints ?? []
    }); })
  };
}
