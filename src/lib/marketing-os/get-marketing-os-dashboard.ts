import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MarketingOsBrandOption = {
  id: string;
  name: string;
  website: string | null;
};

export type MarketingOsRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  meta: string;
};

export type MarketingOsBlueprint = {
  campaignKey: string;
  label: string;
  plainGoal: string;
  promptStarter: string;
  minimumPlanKey: string;
};

export type MarketingOsDashboard = {
  brands: MarketingOsBrandOption[];
  blueprints: MarketingOsBlueprint[];
  metrics: {
    businessProfiles: number;
    websiteImports: number;
    campaigns: number;
    contentOutputs: number;
    mediaAssets: number;
    graphicJobs: number;
    videoJobs: number;
  };
  profiles: MarketingOsRow[];
  websiteImports: MarketingOsRow[];
  campaigns: MarketingOsRow[];
  outputs: MarketingOsRow[];
  mediaAssets: MarketingOsRow[];
  graphicJobs: MarketingOsRow[];
  videoJobs: MarketingOsRow[];
};

function num(value: string | undefined) {
  return Number(value ?? 0);
}

function row(id: string, title: string, detail: string | null, status: string, meta: string): MarketingOsRow {
  return { id, title, detail, status, meta };
}

export async function getMarketingOsDashboard(): Promise<MarketingOsDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [
    brandsResult,
    blueprintResult,
    metricResult,
    profileResult,
    importResult,
    campaignResult,
    outputResult,
    mediaResult,
    graphicResult,
    videoResult
  ] = await Promise.all([
    queryPostgres<{ id: string; name: string; domain: string | null }>(
      `
      select id, name, domain
      from public.brands
      where tenant_id = $1 and status <> 'archived'
      order by created_at asc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      campaign_key: string;
      label: string;
      plain_goal: string;
      prompt_starter: string;
      minimum_plan_key: string;
    }>(
      `
      select campaign_key, label, plain_goal, prompt_starter, minimum_plan_key
      from public.marketing_os_campaign_blueprints
      where status = 'active'
      order by sort_order asc
      `
    ),
    queryPostgres<{
      business_profiles: string;
      website_imports: string;
      campaigns: string;
      content_outputs: string;
      media_assets: string;
      graphic_jobs: string;
      video_jobs: string;
    }>(
      `
      select
        (select count(*) from public.marketing_os_business_profiles where tenant_id = $1 and status <> 'archived')::text as business_profiles,
        (select count(*) from public.marketing_os_website_imports where tenant_id = $1 and status <> 'canceled')::text as website_imports,
        (select count(*) from public.content_studio_campaigns where tenant_id = $1 and status <> 'archived')::text as campaigns,
        (select count(*) from public.content_studio_outputs where tenant_id = $1 and status <> 'archived')::text as content_outputs,
        (select count(*) from public.marketing_media_assets where tenant_id = $1 and status <> 'archived')::text as media_assets,
        (select count(*) from public.marketing_graphic_jobs where tenant_id = $1 and status <> 'archived')::text as graphic_jobs,
        (select count(*) from public.marketing_video_jobs where tenant_id = $1 and status <> 'archived')::text as video_jobs
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      company_name: string | null;
      website_url: string | null;
      brand_voice: string | null;
      status: string;
      services_json: unknown[];
      service_areas_json: unknown[];
    }>(
      `
      select id, company_name, website_url, brand_voice, status, services_json, service_areas_json
      from public.marketing_os_business_profiles
      where tenant_id = $1 and status <> 'archived'
      order by updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      website_url: string;
      status: string;
      error_message: string | null;
      created_at: Date;
    }>(
      `
      select id, website_url, status, error_message, created_at
      from public.marketing_os_website_imports
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      campaign_name: string;
      prompt: string;
      status: string;
      output_count: number;
      approval_required: boolean;
    }>(
      `
      select id, campaign_name, prompt, status, output_count, approval_required
      from public.content_studio_campaigns
      where tenant_id = $1
      order by updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      output_type: string;
      title: string;
      status: string;
      risk_level: string;
    }>(
      `
      select id, output_type, title, status, risk_level
      from public.content_studio_outputs
      where tenant_id = $1
      order by created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      asset_type: string;
      title: string;
      status: string;
      service_label: string | null;
      campaign_label: string | null;
      approved_for_ai_reuse: boolean;
    }>(
      `
      select id, asset_type, title, status, service_label, campaign_label, approved_for_ai_reuse
      from public.marketing_media_assets
      where tenant_id = $1
      order by updated_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      job_type: string;
      status: string;
      service_label: string | null;
      target_formats: string[];
    }>(
      `
      select id, job_type, status, service_label, target_formats
      from public.marketing_graphic_jobs
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      provider_key: string;
      service_label: string | null;
      goal: string | null;
      status: string;
      cta_text: string | null;
    }>(
      `
      select id, provider_key, service_label, goal, status, cta_text
      from public.marketing_video_jobs
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricResult?.rows[0];

  return {
    brands: (brandsResult?.rows ?? []).map((brand) => ({ id: brand.id, name: brand.name, website: brand.domain })),
    blueprints: (blueprintResult?.rows ?? []).map((blueprint) => ({
      campaignKey: blueprint.campaign_key,
      label: blueprint.label,
      plainGoal: blueprint.plain_goal,
      promptStarter: blueprint.prompt_starter,
      minimumPlanKey: blueprint.minimum_plan_key
    })),
    metrics: {
      businessProfiles: num(metrics?.business_profiles),
      websiteImports: num(metrics?.website_imports),
      campaigns: num(metrics?.campaigns),
      contentOutputs: num(metrics?.content_outputs),
      mediaAssets: num(metrics?.media_assets),
      graphicJobs: num(metrics?.graphic_jobs),
      videoJobs: num(metrics?.video_jobs)
    },
    profiles: (profileResult?.rows ?? []).map((profile) =>
      row(
        profile.id,
        profile.company_name ?? "Business profile",
        profile.brand_voice,
        profile.status,
        `${profile.website_url ?? "No website"} / ${profile.services_json.length} services / ${profile.service_areas_json.length} areas`
      )
    ),
    websiteImports: (importResult?.rows ?? []).map((item) =>
      row(item.id, item.website_url, item.error_message, item.status, new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.created_at)))
    ),
    campaigns: (campaignResult?.rows ?? []).map((campaign) =>
      row(campaign.id, campaign.campaign_name, campaign.prompt, campaign.status, `${campaign.output_count} outputs / ${campaign.approval_required ? "approval required" : "approval optional"}`)
    ),
    outputs: (outputResult?.rows ?? []).map((output) =>
      row(output.id, output.title, output.output_type, output.status, output.risk_level)
    ),
    mediaAssets: (mediaResult?.rows ?? []).map((asset) =>
      row(asset.id, asset.title, asset.campaign_label, asset.status, `${asset.asset_type} / ${asset.service_label ?? "general"} / ${asset.approved_for_ai_reuse ? "AI reuse approved" : "not approved for AI reuse"}`)
    ),
    graphicJobs: (graphicResult?.rows ?? []).map((job) =>
      row(job.id, job.job_type.replaceAll("_", " "), job.service_label, job.status, job.target_formats.join(", ") || "formats not selected")
    ),
    videoJobs: (videoResult?.rows ?? []).map((job) =>
      row(job.id, job.goal ?? "Video job", job.cta_text, job.status, `${job.provider_key} / ${job.service_label ?? "general"}`)
    )
  };
}
