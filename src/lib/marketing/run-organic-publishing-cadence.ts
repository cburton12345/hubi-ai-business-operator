import { queryPostgres } from "@/lib/db/postgres";

type BrandCadence = {
  tenant_id: string;
  brand_id: string;
  approval_mode: "manual" | "low_risk_auto" | "recommend_only";
  organic_weekly_moment_target: number;
  organic_channels: string[];
  usage_limit: number | null;
};

type Candidate = {
  draft_id: string;
  target_platform: string;
  publishing_moment_key: string;
};

export async function runOrganicPublishingCadence(options: { brandLimit?: number } = {}) {
  const brandLimit = Math.max(1, Math.min(options.brandLimit ?? 100, 500));
  const brands = await queryPostgres<BrandCadence>(
    `
    select ms.tenant_id, ms.brand_id, ms.approval_mode,
           ms.organic_weekly_moment_target, ms.organic_channels,
           entitlement.usage_limit
    from public.brand_marketing_settings ms
    join public.workspace_feature_entitlements entitlement
      on entitlement.tenant_id = ms.tenant_id
     and entitlement.feature_key = 'publishing_queue'
     and entitlement.status <> 'disabled'
    where ms.organic_publishing_enabled = true
      and ms.organic_weekly_moment_target > 0
    order by ms.updated_at asc
    limit $1
    `,
    [brandLimit]
  );

  let queuedMoments = 0;
  let queuedAdaptations = 0;
  for (const brand of brands?.rows ?? []) {
    const used = await queryPostgres<{ used: number }>(
      `
      select count(distinct publishing_moment_key)::int as used
      from public.publishing_queue
      where tenant_id = $1 and brand_id = $2
        and distribution_type = 'organic'
        and publishing_moment_key is not null
        and queue_status <> 'canceled'
        and created_at >= date_trunc('week', now())
      `,
      [brand.tenant_id, brand.brand_id]
    );
    const planLimit = brand.usage_limit ?? 0;
    const target = Math.min(brand.organic_weekly_moment_target, planLimit);
    const remaining = Math.max(0, target - (used?.rows[0]?.used ?? 0));
    if (!remaining) continue;

    const candidates = await queryPostgres<Candidate>(
      `
      select d.id as draft_id,
        case
          when d.content_type = 'gbp_post' then 'google_business_profile'
          when d.content_type = 'facebook_post' then 'facebook'
          when d.content_type = 'instagram_post' then 'instagram'
          when d.content_type = 'linkedin_post' then 'linkedin'
          else 'website'
        end as target_platform,
        coalesce(
          nullif(d.metadata_json->>'publishingMomentKey', ''),
          nullif(d.metadata_json->>'campaignId', ''),
          nullif(d.metadata_json->>'bundleId', ''),
          nullif(d.metadata_json->>'sourceJobId', ''),
          'draft:' || d.id::text
        ) as publishing_moment_key
      from public.ai_drafts d
      join public.content_quality_reviews quality
        on quality.tenant_id = d.tenant_id
       and quality.draft_id = d.id
       and quality.quality_status = 'passed'
      where d.tenant_id = $1 and d.brand_id = $2
        and d.status = 'approved'
        and d.content_type in ('blog','city_page','service_page','gbp_post','facebook_post','instagram_post','linkedin_post')
        and not exists (
          select 1 from public.publishing_queue queue
          where queue.tenant_id = d.tenant_id and queue.draft_id = d.id and queue.queue_status <> 'canceled'
        )
      order by d.updated_at desc
      limit 100
      `,
      [brand.tenant_id, brand.brand_id]
    );

    const allowedChannels = new Set(brand.organic_channels);
    const selected = new Map<string, Candidate[]>();
    for (const candidate of candidates?.rows ?? []) {
      if (!allowedChannels.has(candidate.target_platform)) continue;
      const existing = selected.get(candidate.publishing_moment_key);
      if (existing) {
        existing.push(candidate);
      } else if (selected.size < remaining) {
        selected.set(candidate.publishing_moment_key, [candidate]);
      }
    }

    let slot = 0;
    for (const [momentKey, adaptations] of selected) {
      for (const adaptation of adaptations) {
        await queryPostgres(
          `
          insert into public.publishing_queue (
            tenant_id, brand_id, draft_id, target_platform, provider_status, queue_status,
            scheduled_for, publishing_moment_key, distribution_type, paid_spend_required, metadata_json
          )
          values ($1, $2, $3, $4, 'not_connected', $5,
                  now() + ($6::int * interval '1 day'), $7, 'organic', false,
                  jsonb_build_object(
                    'createdBy', 'organic_publishing_cadence',
                    'qualityGateRequired', true,
                    'organicOnly', true,
                    'paidSpendAuthorized', false,
                    'providerConnectionRequired', true
                  ))
          on conflict do nothing
          `,
          [
            brand.tenant_id,
            brand.brand_id,
            adaptation.draft_id,
            adaptation.target_platform,
            brand.approval_mode === "low_risk_auto" ? "approved" : "needs_approval",
            slot,
            momentKey
          ]
        );
        queuedAdaptations += 1;
      }
      queuedMoments += 1;
      slot += 1;
    }
  }

  return { brandsChecked: brands?.rows.length ?? 0, queuedMoments, queuedAdaptations };
}
