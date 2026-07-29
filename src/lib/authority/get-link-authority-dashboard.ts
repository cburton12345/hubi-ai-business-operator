import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function count(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getLinkAuthorityDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const [metricsResult, brandsResult, linksResult, opportunitiesResult, assetsResult] = await Promise.all([
    queryPostgres<{
      total_links: string;
      active_links: string;
      lost_links: string;
      suspicious_links: string;
      referral_visits: string;
      attributed_leads: string;
      attributed_revenue_cents: string;
      estimated_market_value_cents: string;
      open_opportunities: string;
      earned_opportunities: string;
      published_assets: string;
    }>(
      `
      select
        (select count(*) from public.authority_backlinks where tenant_id = $1 and status <> 'ignored')::text as total_links,
        (select count(*) from public.authority_backlinks where tenant_id = $1 and status = 'active')::text as active_links,
        (select count(*) from public.authority_backlinks where tenant_id = $1 and status = 'lost')::text as lost_links,
        (select count(*) from public.authority_backlinks where tenant_id = $1 and status = 'suspicious')::text as suspicious_links,
        (select coalesce(sum(referral_visits), 0) from public.authority_backlinks where tenant_id = $1)::text as referral_visits,
        (select coalesce(sum(attributed_leads), 0) from public.authority_backlinks where tenant_id = $1)::text as attributed_leads,
        (select coalesce(sum(attributed_revenue_cents), 0) from public.authority_backlinks where tenant_id = $1)::text as attributed_revenue_cents,
        (select coalesce(sum(estimated_market_value_cents), 0) from public.authority_backlinks where tenant_id = $1)::text as estimated_market_value_cents,
        (select count(*) from public.authority_link_opportunities where tenant_id = $1 and status not in ('earned', 'dismissed'))::text as open_opportunities,
        (select count(*) from public.authority_link_opportunities where tenant_id = $1 and status = 'earned')::text as earned_opportunities,
        (select count(*) from public.authority_linkable_assets where tenant_id = $1 and status = 'published')::text as published_assets
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string; domain: string | null }>(
      `select id, name, domain from public.brands where tenant_id = $1 and status = 'active' order by name`,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      source_url: string;
      source_domain: string;
      target_url: string;
      anchor_text: string | null;
      link_type: string;
      status: string;
      domain_rating: number | null;
      relevance_score: number;
      quality_score: number;
      risk_level: string;
      referral_visits: number;
      attributed_leads: number;
      attributed_revenue_cents: number;
      estimated_market_value_cents: number;
      risk_flags_json: unknown;
      updated_at: string;
    }>(
      `
      select l.id, b.name as brand_name, l.source_url, l.source_domain, l.target_url,
        l.anchor_text, l.link_type, l.status, l.domain_rating, l.relevance_score,
        l.quality_score, l.risk_level, l.referral_visits, l.attributed_leads,
        l.attributed_revenue_cents, l.estimated_market_value_cents,
        l.risk_flags_json, l.updated_at
      from public.authority_backlinks l
      left join public.brands b on b.id = l.brand_id
      where l.tenant_id = $1
      order by
        case l.status when 'suspicious' then 1 when 'lost' then 2 when 'unverified' then 3 else 4 end,
        l.quality_score desc,
        l.updated_at desc
      limit 100
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      asset_title: string | null;
      opportunity_type: string;
      organization_name: string;
      opportunity_url: string | null;
      status: string;
      relevance_score: number;
      confidence: string;
      risk_level: string;
      recommended_asset: string | null;
      recommended_action: string | null;
      relationship_evidence: string | null;
    }>(
      `
      select o.id, b.name as brand_name, a.title as asset_title, o.opportunity_type,
        o.organization_name, o.opportunity_url, o.status, o.relevance_score,
        o.confidence, o.risk_level, o.recommended_asset, o.recommended_action,
        o.relationship_evidence
      from public.authority_link_opportunities o
      left join public.brands b on b.id = o.brand_id
      left join public.authority_linkable_assets a on a.id = o.asset_id
      where o.tenant_id = $1
      order by
        case o.status when 'qualified' then 1 when 'ready_for_outreach' then 2 when 'asset_needed' then 3 when 'discovered' then 4 else 5 end,
        o.relevance_score desc,
        o.updated_at desc
      limit 100
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      asset_type: string;
      title: string;
      public_url: string | null;
      status: string;
      usefulness_score: number;
      originality_score: number;
      evidence_summary: string | null;
      recommended_next_action: string | null;
    }>(
      `
      select a.id, b.name as brand_name, a.asset_type, a.title, a.public_url,
        a.status, a.usefulness_score, a.originality_score, a.evidence_summary,
        a.recommended_next_action
      from public.authority_linkable_assets a
      left join public.brands b on b.id = a.brand_id
      where a.tenant_id = $1
      order by
        case a.status when 'published' then 1 when 'approved' then 2 when 'draft' then 3 when 'needs_proof' then 4 else 5 end,
        (a.usefulness_score + a.originality_score) desc,
        a.updated_at desc
      limit 100
      `,
      [tenantId]
    )
  ]);

  const metrics = metricsResult?.rows[0];
  return {
    brands: brandsResult?.rows ?? [],
    links: (linksResult?.rows ?? []).map((row) => ({
      ...row,
      riskFlags: Array.isArray(row.risk_flags_json) ? row.risk_flags_json as Array<{ key: string; label: string; detail: string }> : []
    })),
    opportunities: opportunitiesResult?.rows ?? [],
    assets: assetsResult?.rows ?? [],
    metrics: {
      totalLinks: count(metrics?.total_links),
      activeLinks: count(metrics?.active_links),
      lostLinks: count(metrics?.lost_links),
      suspiciousLinks: count(metrics?.suspicious_links),
      referralVisits: count(metrics?.referral_visits),
      attributedLeads: count(metrics?.attributed_leads),
      attributedRevenueCents: count(metrics?.attributed_revenue_cents),
      estimatedMarketValueCents: count(metrics?.estimated_market_value_cents),
      openOpportunities: count(metrics?.open_opportunities),
      earnedOpportunities: count(metrics?.earned_opportunities),
      publishedAssets: count(metrics?.published_assets)
    }
  };
}
