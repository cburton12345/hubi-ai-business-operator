import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";

export type LinkAuthoritySyncResult = {
  status: "ready" | "blocked";
  assetsSynced: number;
  risksEscalated: number;
  opportunitiesSurfaced: number;
};

function changed(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

export async function syncLinkAuthorityForTenant(tenantId: string): Promise<LinkAuthoritySyncResult> {
  const gate = await getServiceGate(tenantId, "authority_link_intelligence");
  if (!gate.enabled) return { status: "blocked", assetsSynced: 0, risksEscalated: 0, opportunitiesSurfaced: 0 };

  const assets = await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, ai_draft_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action, metadata_json
    )
    select d.tenant_id, d.brand_id, d.id,
      case d.content_type when 'case_study' then 'case_study' when 'faq' then 'faq'
        when 'city_page' then 'local_guide' else 'resource' end,
      coalesce(d.title, 'Untitled authority asset'),
      case when d.status = 'published' then 'published' when d.status = 'approved' then 'approved' else 'draft' end,
      case when d.content_type in ('case_study','faq') then 80 else 65 end,
      case when d.content_type = 'case_study' then 85 else 60 end,
      'Existing Ferocity content grounded in the business record.',
      case when d.status in ('approved','published')
        then 'Match this asset to a genuinely relevant organization or resource page.'
        else 'Strengthen the asset with original proof before seeking links.' end,
      jsonb_build_object('source', 'authority_automation', 'automatedOutreach', false)
    from public.ai_drafts d
    where d.tenant_id = $1
      and d.content_type in ('case_study','faq','blog','service_page','city_page','landing_page')
      and d.status in ('draft','needs_review','approved','published')
    on conflict (tenant_id, ai_draft_id) where ai_draft_id is not null do update
    set status = excluded.status, title = excluded.title, updated_at = now()
    `,
    [tenantId]
  );
  const jobAssets = await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, job_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action, metadata_json
    )
    select j.tenant_id, j.brand_id, j.id, 'case_study', j.title || ' project case study',
      'needs_proof', 75, 90, concat_ws(' ', 'Completed real job.', nullif(j.completion_notes, '')),
      'Add approved before/after proof, customer consent, useful details, and a public page.',
      jsonb_build_object('source', 'construction_to_authority_automation', 'customerConsentRequired', true, 'automatedOutreach', false)
    from public.service_jobs j
    where j.tenant_id = $1 and j.status = 'completed'
    on conflict (tenant_id, job_id, asset_type) where job_id is not null do update
    set evidence_summary = excluded.evidence_summary, updated_at = now()
    `,
    [tenantId]
  );
  const knowledgeAssets = await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, knowledge_article_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action, metadata_json
    )
    select k.tenant_id, k.brand_id, k.id,
      case when k.article_type = 'faq' then 'faq' else 'resource' end,
      k.title, case when k.status = 'approved' then 'approved' else 'draft' end,
      70, 80, 'Project knowledge built from real Ferocity records.',
      'Confirm private information is removed, then turn this into a useful public resource.',
      jsonb_build_object('source', 'knowledge_to_authority_automation', 'automatedOutreach', false)
    from public.authority_knowledge_articles k
    where k.tenant_id = $1 and k.status in ('draft','needs_review','approved')
    on conflict (tenant_id, knowledge_article_id) where knowledge_article_id is not null do update
    set status = excluded.status, title = excluded.title, updated_at = now()
    `,
    [tenantId]
  );
  await queryPostgres(
    `
    insert into public.authority_link_opportunities (
      tenant_id, brand_id, opportunity_type, organization_name, opportunity_url,
      opportunity_domain, target_url, status, relevance_score, confidence,
      recommended_asset, recommended_action, relationship_evidence, metadata_json
    )
    select s.tenant_id, b.id, 'supplier_directory', s.name, s.website_url,
      lower(regexp_replace(regexp_replace(s.website_url, '^https?://', ''), '/.*$', '')),
      case when b.domain is null then null
        when b.domain ~ '^https?://' then b.domain else 'https://' || b.domain end,
      'discovered', 70, 'medium',
      'A real project case study, installer profile, or useful product/application guide.',
      'Check for a contractor directory, project gallery, dealer page, or useful resource contribution process.',
      'Existing supplier in Ferocity purchasing records.',
      jsonb_build_object('source', 'supplier_relationship_automation', 'automatedOutreach', false, 'reciprocalExchange', false)
    from public.suppliers s
    join lateral (
      select id, domain from public.brands
      where tenant_id = s.tenant_id and status = 'active'
      order by created_at limit 1
    ) b on true
    where s.tenant_id = $1 and s.status = 'active'
      and s.website_url is not null and s.website_url <> ''
    on conflict (tenant_id, opportunity_type, (lower(organization_name)), (coalesce(opportunity_domain, ''))) do update
    set relationship_evidence = excluded.relationship_evidence,
        recommended_action = excluded.recommended_action,
        updated_at = now()
    `,
    [tenantId]
  );

  const risks = await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
      action_href, money_cents, risk_type, confidence_score, metadata_json
    )
    select b.tenant_id, 'ferocity', 'Ferocity', 'authority-link-risk:' || b.id,
      'authority.link_risk', 'A backlink needs attention',
      b.source_domain || ' is marked ' || b.status || '. Verify it before treating it as authority.',
      case when b.risk_level = 'high' then 'high' else 'medium' end,
      'needs_owner', true, false, 'Ferocity detected a lost or suspicious authority signal.',
      'Open Link Authority, verify the source, and ignore, repair, or replace the link.',
      '/app/authority/links', greatest(b.estimated_market_value_cents, 0),
      'customer', greatest(55, least(95, b.quality_score)), jsonb_build_object('backlinkId', b.id)
    from public.authority_backlinks b
    where b.tenant_id = $1 and b.status in ('lost','suspicious')
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
    do update set
      summary = excluded.summary, severity = excluded.severity, status = 'needs_owner',
      owner_attention = true, recommended_action = excluded.recommended_action,
      money_cents = excluded.money_cents, metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      occurred_at = now(), updated_at = now()
    `,
    [tenantId]
  );

  const opportunities = await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
      action_href, risk_type, confidence_score, metadata_json
    )
    select o.tenant_id, 'ferocity', 'Ferocity', 'authority-link-opportunity:' || o.id,
      'authority.link_opportunity', 'Authority opportunity is ready',
      o.organization_name || ' is a relevant authority opportunity with real relationship evidence.',
      case when o.relevance_score >= 85 then 'high' else 'medium' end,
      'needs_owner', true, false, 'Ferocity qualified the opportunity without sending outreach.',
      coalesce(o.recommended_action, 'Review the evidence and choose the right useful asset before outreach.'),
      '/app/authority/links', 'revenue', greatest(55, least(95, o.relevance_score)),
      jsonb_build_object('opportunityId', o.id, 'assetId', o.asset_id)
    from public.authority_link_opportunities o
    where o.tenant_id = $1
      and o.status in ('qualified','asset_needed','ready_for_outreach')
      and o.relevance_score >= 70
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
    do update set
      title = excluded.title, summary = excluded.summary, severity = excluded.severity,
      status = 'needs_owner', owner_attention = true,
      recommended_action = excluded.recommended_action,
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      occurred_at = now(), updated_at = now()
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    update public.owner_command_events e
    set status = 'resolved', owner_attention = false, ai_handled = true,
      ai_summary = 'Ferocity rechecked the authority signal and it no longer needs owner attention.',
      updated_at = now()
    where e.tenant_id = $1 and e.status <> 'resolved'
      and (
        (e.event_type = 'authority.link_risk' and not exists (
          select 1 from public.authority_backlinks b
          where 'authority-link-risk:' || b.id = e.external_event_id and b.status in ('lost','suspicious')
        ))
        or
        (e.event_type = 'authority.link_opportunity' and not exists (
          select 1 from public.authority_link_opportunities o
          where 'authority-link-opportunity:' || o.id = e.external_event_id
            and o.status in ('qualified','asset_needed','ready_for_outreach') and o.relevance_score >= 70
        ))
      )
    `,
    [tenantId]
  );

  return {
    status: "ready",
    assetsSynced: changed(assets) + changed(jobAssets) + changed(knowledgeAssets),
    risksEscalated: changed(risks),
    opportunitiesSurfaced: changed(opportunities)
  };
}
