"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { assessBacklink, domainFromUrl, normalizeWebUrl } from "@/lib/authority/link-intelligence";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";

const backlinkSchema = z.object({
  brandId: z.string().uuid().nullable(),
  sourceUrl: z.string().trim().min(4).max(2000),
  targetUrl: z.string().trim().min(4).max(2000),
  anchorText: z.string().trim().max(500).optional(),
  linkType: z.enum(["earned", "editorial", "directory", "supplier", "manufacturer", "association", "local_media", "partner", "customer_story", "sponsorship", "manual", "unknown"]),
  domainRating: z.number().min(0).max(100).nullable(),
  relevanceScore: z.number().min(0).max(100),
  estimatedMarketValueCents: z.number().int().min(0)
});

const opportunitySchema = z.object({
  brandId: z.string().uuid().nullable(),
  opportunityType: z.enum(["supplier_directory", "manufacturer_installer", "chamber", "association", "local_media", "resource_page", "partner", "customer_story", "sponsorship", "digital_pr", "manual"]),
  organizationName: z.string().trim().min(2).max(300),
  opportunityUrl: z.string().trim().max(2000).optional(),
  relevanceScore: z.number().min(0).max(100),
  relationshipEvidence: z.string().trim().max(2000).optional(),
  recommendedAction: z.string().trim().max(2000).optional()
});

function numberOr(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function moneyToCents(value: FormDataEntryValue | null) {
  return Math.max(0, Math.round(numberOr(value) * 100));
}

function refresh() {
  revalidatePath("/app/authority");
  revalidatePath("/app/authority/links");
}

async function requireLinkAuthority() {
  const actor = await requirePermission("ai:queue");
  const gate = await getServiceGate(actor.workspace.id, "authority_link_intelligence");
  return gate.enabled ? actor : null;
}

async function saveBacklink(tenantId: string, input: z.infer<typeof backlinkSchema>) {
  const sourceUrl = normalizeWebUrl(input.sourceUrl);
  const targetUrl = normalizeWebUrl(input.targetUrl);
  if (!sourceUrl || !targetUrl) return;
  const assessment = assessBacklink({ ...input, sourceUrl, targetUrl });
  await queryPostgres(
    `
    insert into public.authority_backlinks (
      tenant_id, brand_id, source_url, source_domain, target_url, anchor_text,
      link_type, status, domain_rating, relevance_score, quality_score, risk_level,
      estimated_market_value_cents, risk_flags_json, evidence_json, last_checked_at,
      metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,now(),$16::jsonb)
    on conflict (tenant_id, source_url, target_url) do update
    set brand_id = coalesce(excluded.brand_id, public.authority_backlinks.brand_id),
        anchor_text = excluded.anchor_text,
        link_type = excluded.link_type,
        domain_rating = excluded.domain_rating,
        relevance_score = excluded.relevance_score,
        quality_score = excluded.quality_score,
        risk_level = excluded.risk_level,
        status = case when excluded.status = 'suspicious' then 'suspicious' else public.authority_backlinks.status end,
        estimated_market_value_cents = excluded.estimated_market_value_cents,
        risk_flags_json = excluded.risk_flags_json,
        evidence_json = excluded.evidence_json,
        last_checked_at = now(),
        updated_at = now()
    `,
    [
      tenantId,
      input.brandId,
      sourceUrl,
      assessment.sourceDomain,
      targetUrl,
      input.anchorText || null,
      input.linkType,
      assessment.riskLevel === "high" ? "suspicious" : "unverified",
      input.domainRating,
      input.relevanceScore,
      assessment.qualityScore,
      assessment.riskLevel,
      input.estimatedMarketValueCents,
      JSON.stringify(assessment.riskFlags),
      JSON.stringify(assessment.evidence),
      JSON.stringify({ source: "manual_or_import", marketValueIsEstimate: true, rankingGuarantee: false })
    ]
  );
}

export async function recordBacklinkAction(formData: FormData) {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const parsed = backlinkSchema.safeParse({
    brandId: formData.get("brandId")?.toString() || null,
    sourceUrl: formData.get("sourceUrl"),
    targetUrl: formData.get("targetUrl"),
    anchorText: formData.get("anchorText")?.toString() || undefined,
    linkType: formData.get("linkType") || "unknown",
    domainRating: formData.get("domainRating")?.toString() ? numberOr(formData.get("domainRating")) : null,
    relevanceScore: numberOr(formData.get("relevanceScore"), 50),
    estimatedMarketValueCents: moneyToCents(formData.get("estimatedMarketValue"))
  });
  if (!parsed.success) return;
  await saveBacklink(actor.workspace.id, parsed.data);
  refresh();
}

export async function importBacklinksAction(formData: FormData) {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const brandId = formData.get("brandId")?.toString() || null;
  const targetFallback = formData.get("targetUrl")?.toString() || "";
  const lines = (formData.get("backlinks")?.toString() || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 200);
  for (const line of lines) {
    const [sourceUrl, targetUrl = targetFallback, anchorText = "", dr = "", relevance = "50", value = "0"] = line.split(/\s*\|\s*/);
    const parsed = backlinkSchema.safeParse({
      brandId,
      sourceUrl,
      targetUrl,
      anchorText,
      linkType: "unknown",
      domainRating: dr ? numberOr(dr) : null,
      relevanceScore: numberOr(relevance, 50),
      estimatedMarketValueCents: moneyToCents(value)
    });
    if (parsed.success) await saveBacklink(actor.workspace.id, parsed.data);
  }
  refresh();
}

export async function addLinkOpportunityAction(formData: FormData) {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const parsed = opportunitySchema.safeParse({
    brandId: formData.get("brandId")?.toString() || null,
    opportunityType: formData.get("opportunityType") || "manual",
    organizationName: formData.get("organizationName"),
    opportunityUrl: formData.get("opportunityUrl")?.toString() || undefined,
    relevanceScore: numberOr(formData.get("relevanceScore"), 50),
    relationshipEvidence: formData.get("relationshipEvidence")?.toString() || undefined,
    recommendedAction: formData.get("recommendedAction")?.toString() || undefined
  });
  if (!parsed.success) return;
  const opportunityUrl = parsed.data.opportunityUrl ? normalizeWebUrl(parsed.data.opportunityUrl) : null;
  await queryPostgres(
    `
    insert into public.authority_link_opportunities (
      tenant_id, brand_id, opportunity_type, organization_name, opportunity_url,
      opportunity_domain, relevance_score, relationship_evidence, recommended_action,
      recommended_asset, status, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Choose a real, useful asset that serves this organization''s audience.','discovered',$10::jsonb)
    on conflict (tenant_id, opportunity_type, (lower(organization_name)), (coalesce(opportunity_domain, ''))) do update
    set relevance_score = excluded.relevance_score,
        relationship_evidence = excluded.relationship_evidence,
        recommended_action = excluded.recommended_action,
        updated_at = now()
    `,
    [
      actor.workspace.id,
      parsed.data.brandId,
      parsed.data.opportunityType,
      parsed.data.organizationName,
      opportunityUrl,
      opportunityUrl ? domainFromUrl(opportunityUrl) : null,
      parsed.data.relevanceScore,
      parsed.data.relationshipEvidence || null,
      parsed.data.recommendedAction || "Verify relevance and the real relationship before preparing contact.",
      JSON.stringify({ automatedOutreach: false, reciprocalExchange: false })
    ]
  );
  refresh();
}

export async function scanExistingAuthorityAssetsAction() {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const tenantId = actor.workspace.id;

  await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, ai_draft_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action,
      metadata_json
    )
    select d.tenant_id, d.brand_id, d.id,
      case d.content_type
        when 'case_study' then 'case_study'
        when 'faq' then 'faq'
        when 'city_page' then 'local_guide'
        else 'resource'
      end,
      coalesce(d.title, 'Untitled authority asset'),
      case when d.status = 'published' then 'published' when d.status = 'approved' then 'approved' else 'draft' end,
      case when d.content_type in ('case_study','faq') then 80 else 65 end,
      case when d.content_type = 'case_study' then 85 else 60 end,
      'Existing Ferocity content draft. Verify the facts, proof, usefulness, and public URL.',
      case when d.status in ('approved','published') then 'Match this asset to a genuinely relevant organization or resource page.' else 'Review and strengthen the asset with original proof before seeking links.' end,
      jsonb_build_object('source', 'existing_ai_draft', 'automatedOutreach', false)
    from public.ai_drafts d
    where d.tenant_id = $1
      and d.content_type in ('case_study','faq','blog','service_page','city_page','landing_page')
      and d.status in ('draft','needs_review','approved','published')
    on conflict (tenant_id, ai_draft_id) where ai_draft_id is not null do update
    set status = excluded.status,
        title = excluded.title,
        updated_at = now()
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, job_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action,
      metadata_json
    )
    select j.tenant_id, j.brand_id, j.id, 'case_study',
      j.title || ' project case study', 'needs_proof', 75, 90,
      concat_ws(' ', 'Completed real job.', nullif(j.completion_notes, '')),
      'Add approved before/after proof, customer consent, useful project details, and a public page.',
      jsonb_build_object('source', 'completed_job', 'customerConsentRequired', true, 'automatedOutreach', false)
    from public.service_jobs j
    where j.tenant_id = $1 and j.status = 'completed'
    on conflict (tenant_id, job_id, asset_type) where job_id is not null do update
    set evidence_summary = excluded.evidence_summary,
        updated_at = now()
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    insert into public.authority_linkable_assets (
      tenant_id, brand_id, knowledge_article_id, asset_type, title, status,
      usefulness_score, originality_score, evidence_summary, recommended_next_action,
      metadata_json
    )
    select k.tenant_id, k.brand_id, k.id,
      case when k.article_type = 'faq' then 'faq' else 'resource' end,
      k.title, case when k.status = 'approved' then 'approved' else 'draft' end,
      70, 80, 'Project knowledge built from real Ferocity records.',
      'Confirm private information is removed, then turn this into a useful public resource.',
      jsonb_build_object('source', 'authority_knowledge_article', 'automatedOutreach', false)
    from public.authority_knowledge_articles k
    where k.tenant_id = $1 and k.status in ('draft','needs_review','approved')
    on conflict (tenant_id, knowledge_article_id) where knowledge_article_id is not null do update
    set status = excluded.status,
        title = excluded.title,
        updated_at = now()
    `,
    [tenantId]
  );

  const suppliers = await queryPostgres<{ name: string; website_url: string; brand_id: string | null; target_url: string | null }>(
    `
    select s.name, s.website_url, b.id as brand_id,
      case when b.domain is null then null else
        case when b.domain ~ '^https?://' then b.domain else 'https://' || b.domain end
      end as target_url
    from public.suppliers s
    left join lateral (
      select id, domain from public.brands
      where tenant_id = $1 and status = 'active'
      order by created_at
      limit 1
    ) b on true
    where s.tenant_id = $1 and s.status = 'active'
      and s.website_url is not null and s.website_url <> ''
    limit 100
    `,
    [tenantId]
  );
  for (const supplier of suppliers?.rows ?? []) {
    const url = normalizeWebUrl(supplier.website_url);
    if (!url) continue;
    await queryPostgres(
      `
      insert into public.authority_link_opportunities (
        tenant_id, brand_id, opportunity_type, organization_name, opportunity_url,
        opportunity_domain, target_url, status, relevance_score, confidence,
        recommended_asset, recommended_action, relationship_evidence, metadata_json
      )
      values ($1,$2,'supplier_directory',$3,$4,$5,$6,'discovered',70,'medium',
        'A real project case study, installer profile, or useful product/application guide.',
        'Check whether the supplier has a contractor directory, project gallery, dealer page, or resource contribution process.',
        'Existing supplier in Ferocity purchasing records.',
        '{"automatedOutreach":false,"reciprocalExchange":false,"source":"existing_supplier"}'::jsonb)
      on conflict (tenant_id, opportunity_type, (lower(organization_name)), (coalesce(opportunity_domain, ''))) do nothing
      `,
      [tenantId, supplier.brand_id, supplier.name, url, domainFromUrl(url), supplier.target_url]
    );
  }
  refresh();
}

export async function updateLinkOpportunityStatusAction(formData: FormData) {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const parsed = z.object({
    opportunityId: z.string().uuid(),
    status: z.enum(["discovered", "qualified", "asset_needed", "ready_for_outreach", "contacted_manually", "earned", "dismissed"])
  }).safeParse({
    opportunityId: formData.get("opportunityId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;
  await queryPostgres(
    `update public.authority_link_opportunities set status = $3, updated_at = now() where tenant_id = $1 and id = $2`,
    [actor.workspace.id, parsed.data.opportunityId, parsed.data.status]
  );
  refresh();
}

export async function updateBacklinkOutcomeAction(formData: FormData) {
  const actor = await requireLinkAuthority();
  if (!actor) return;
  const parsed = z.object({
    backlinkId: z.string().uuid(),
    status: z.enum(["unverified", "active", "lost", "suspicious", "ignored"]),
    referralVisits: z.number().int().min(0),
    attributedLeads: z.number().int().min(0),
    attributedRevenueCents: z.number().int().min(0)
  }).safeParse({
    backlinkId: formData.get("backlinkId"),
    status: formData.get("status"),
    referralVisits: Math.round(numberOr(formData.get("referralVisits"))),
    attributedLeads: Math.round(numberOr(formData.get("attributedLeads"))),
    attributedRevenueCents: moneyToCents(formData.get("attributedRevenue"))
  });
  if (!parsed.success) return;
  await queryPostgres(
    `
    update public.authority_backlinks
    set status = $3,
        referral_visits = $4,
        attributed_leads = $5,
        attributed_revenue_cents = $6,
        lost_at = case when $3 = 'lost' then coalesce(lost_at, now()) else null end,
        last_checked_at = now(),
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [actor.workspace.id, parsed.data.backlinkId, parsed.data.status, parsed.data.referralVisits, parsed.data.attributedLeads, parsed.data.attributedRevenueCents]
  );
  refresh();
}
