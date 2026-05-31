import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type HostedGrowthPageRow = {
  id: string;
  tenantId: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  title: string;
  slug: string;
  pageType: string;
  status: string;
  publicUrl: string;
  primaryKeyword: string | null;
  trackingCode: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  formPublicKey: string | null;
  publishedAt: string | null;
};

export type PublicHostedGrowthPage = HostedGrowthPageRow & {
  headline: string;
  subheadline: string;
  businessModel: string;
  industry: string | null;
  primaryGoal: string | null;
  primaryLocation: string | null;
  riskProfile: string;
  brandPhone: string | null;
  brandEmail: string | null;
  ctaGoals: string | null;
  targetCustomers: string | null;
  toneOfVoice: string | null;
  services: { name: string; description: string | null }[];
  locations: { label: string }[];
  offers: { title: string; description: string | null }[];
};

type HostedGrowthPageDbRow = {
  id: string;
  tenant_id: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  primary_keyword: string | null;
  tracking_code: string | null;
  canonical_url: string | null;
  noindex: boolean;
  form_public_key: string | null;
  published_at: string | null;
};

type PublicHostedGrowthPageDbRow = HostedGrowthPageDbRow & {
  headline: string | null;
  subheadline: string | null;
  business_model: string;
  industry: string | null;
  primary_goal: string | null;
  primary_location: string | null;
  risk_profile: string;
  brand_phone: string | null;
  brand_email: string | null;
  cta_goals: string | null;
  target_customers: string | null;
  tone_of_voice: string | null;
  services: { name: string; description: string | null }[];
  locations: { label: string }[];
  offers: { title: string; description: string | null }[];
};

function publicUrl(brandSlug: string, pageSlug: string) {
  return `/sites/${encodeURIComponent(brandSlug)}/${encodeURIComponent(pageSlug)}`;
}

function mapRow(row: HostedGrowthPageDbRow): HostedGrowthPageRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    title: row.title,
    slug: row.slug,
    pageType: row.page_type,
    status: row.status,
    publicUrl: publicUrl(row.brand_slug, row.slug),
    primaryKeyword: row.primary_keyword,
    trackingCode: row.tracking_code,
    canonicalUrl: row.canonical_url,
    noindex: row.noindex,
    formPublicKey: row.form_public_key,
    publishedAt: row.published_at
  };
}

export async function getHostedGrowthPages(): Promise<HostedGrowthPageRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<HostedGrowthPageDbRow>(
    `
    select
      p.id,
      p.tenant_id,
      p.brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      p.title,
      p.slug,
      p.page_type,
      p.status,
      p.primary_keyword,
      p.tracking_code,
      p.canonical_url,
      p.noindex,
      f.public_key as form_public_key,
      p.published_at
    from public.brand_landing_pages p
    join public.brands b on b.id = p.brand_id
    left join public.forms f on f.id = p.form_id
    where p.tenant_id = $1 and p.status <> 'archived'
    order by b.name, p.page_type, p.title
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map(mapRow);
}

export async function getPublicHostedGrowthPage(brandSlug: string, pageSlug: string): Promise<PublicHostedGrowthPage | null> {
  const result = await queryPostgres<PublicHostedGrowthPageDbRow>(
    `
    select
      p.id,
      p.tenant_id,
      p.brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      p.title,
      p.slug,
      p.page_type,
      p.status,
      p.primary_keyword,
      p.tracking_code,
      p.canonical_url,
      p.noindex,
      f.public_key as form_public_key,
      p.published_at,
      p.headline,
      p.subheadline,
      b.business_model,
      b.industry,
      b.primary_goal,
      b.primary_location,
      b.risk_profile,
      b.phone as brand_phone,
      b.email as brand_email,
      s.cta_goals,
      s.target_customers,
      s.tone_of_voice,
      coalesce(services.items, '[]'::jsonb) as services,
      coalesce(locations.items, '[]'::jsonb) as locations,
      coalesce(offers.items, '[]'::jsonb) as offers
    from public.brand_landing_pages p
    join public.brands b on b.id = p.brand_id
    left join public.forms f on f.id = p.form_id and f.active = true
    left join public.brand_marketing_settings s on s.tenant_id = p.tenant_id and s.brand_id = p.brand_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', name, 'description', description) order by priority desc, name) as items
      from public.brand_services
      where tenant_id = p.tenant_id and brand_id = p.brand_id and active = true
    ) services on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('label', coalesce(service_area_name, concat_ws(', ', city, state))) order by priority desc) as items
      from public.brand_locations
      where tenant_id = p.tenant_id and brand_id = p.brand_id and active = true
    ) locations on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('title', title, 'description', description) order by created_at desc) as items
      from public.brand_offers
      where tenant_id = p.tenant_id and brand_id = p.brand_id and active = true
    ) offers on true
    where b.slug = $1 and p.slug = $2 and p.status = 'published'
    limit 1
    `,
    [brandSlug, pageSlug]
  );
  const row = result?.rows[0];
  if (!row) return null;

  return {
    ...mapRow(row),
    headline: row.headline ?? row.title,
    subheadline: row.subheadline ?? row.primary_goal ?? `Request help from ${row.brand_name}.`,
    businessModel: row.business_model,
    industry: row.industry,
    primaryGoal: row.primary_goal,
    primaryLocation: row.primary_location,
    riskProfile: row.risk_profile,
    brandPhone: row.brand_phone,
    brandEmail: row.brand_email,
    ctaGoals: row.cta_goals,
    targetCustomers: row.target_customers,
    toneOfVoice: row.tone_of_voice,
    services: row.services ?? [],
    locations: row.locations ?? [],
    offers: row.offers ?? []
  };
}
