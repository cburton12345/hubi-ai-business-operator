import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MarketingOsBrandOption = {
  id: string;
  name: string;
  website: string | null;
};

export type MarketingOsAdvertisingDestination = {
  id: string;
  platformKey: string;
  displayName: string;
  websiteUrl: string;
  destinationType: string;
  connectionMode: string;
};

export type MarketingOsRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  meta: string;
  href?: string;
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
    recommendations: number;
    memoryItems: number;
    adExperiments: number;
    creativeVariants: number;
    platformPlaybooks: number;
    advertisingDestinations: number;
  };
  profiles: MarketingOsRow[];
  recommendations: MarketingOsRow[];
  memoryItems: MarketingOsRow[];
  adExperiments: MarketingOsRow[];
  creativeVariants: MarketingOsRow[];
  platformPlaybooks: MarketingOsRow[];
  advertisingDestinations: MarketingOsAdvertisingDestination[];
  advertisingDestinationRows: MarketingOsRow[];
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

function row(id: string, title: string, detail: string | null, status: string, meta: string, href?: string): MarketingOsRow {
  return { id, title, detail, status, meta, href };
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
    videoResult,
    recommendationResult,
    memoryResult,
    adExperimentResult,
    creativeVariantResult,
    platformPlaybookResult,
    advertisingDestinationResult
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
      recommendations: string;
      memory_items: string;
      ad_experiments: string;
      creative_variants: string;
      platform_playbooks: string;
      advertising_destinations: string;
    }>(
      `
      select
        (select count(*) from public.marketing_os_business_profiles where tenant_id = $1 and status <> 'archived')::text as business_profiles,
        (select count(*) from public.marketing_os_website_imports where tenant_id = $1 and status <> 'canceled')::text as website_imports,
        (select count(*) from public.content_studio_campaigns where tenant_id = $1 and status <> 'archived')::text as campaigns,
        (select count(*) from public.content_studio_outputs where tenant_id = $1 and status <> 'archived')::text as content_outputs,
        (select count(*) from public.marketing_media_assets where tenant_id = $1 and status <> 'archived')::text as media_assets,
        (select count(*) from public.marketing_graphic_jobs where tenant_id = $1 and status <> 'archived')::text as graphic_jobs,
        (select count(*) from public.marketing_video_jobs where tenant_id = $1 and status <> 'archived')::text as video_jobs,
        (select count(*) from public.marketing_campaign_recommendations where tenant_id = $1 and status <> 'dismissed')::text as recommendations,
        (select count(*) from public.marketing_memory_items where tenant_id = $1 and status <> 'archived')::text as memory_items,
        (select count(*) from public.marketing_ad_experiments where tenant_id = $1 and status <> 'archived')::text as ad_experiments,
        (select count(*) from public.marketing_creative_variants where tenant_id = $1 and status <> 'archived')::text as creative_variants,
        (select count(*) from public.marketing_platform_playbooks where status <> 'archived')::text as platform_playbooks,
        (select count(*) from public.marketing_advertising_destinations where tenant_id = $1 and status <> 'archived')::text as advertising_destinations
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
      metadata_json: { platform?: string; durationSeconds?: number; variantPrompts?: unknown[]; creditRequiredForRendering?: boolean } | null;
    }>(
      `
      select id, provider_key, service_label, goal, status, cta_text, metadata_json
      from public.marketing_video_jobs
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      trigger_reason: string;
      primary_goal: string;
      status: string;
      difficulty: string;
      priority_score: number;
      recommended_channels: string[];
    }>(
      `
      select id, title, trigger_reason, primary_goal, status, difficulty, priority_score, recommended_channels
      from public.marketing_campaign_recommendations
      where tenant_id = $1 and status <> 'dismissed'
      order by priority_score desc, created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      memory_type: string;
      title: string;
      summary: string | null;
      status: string;
      score: number;
    }>(
      `
      select id, memory_type, title, summary, status, score
      from public.marketing_memory_items
      where tenant_id = $1 and status <> 'archived'
      order by score desc, observed_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      experiment_name: string;
      objective: string;
      platforms: string[];
      budget_mode: string;
      budget_cents: number;
      status: string;
      creative_count: number;
    }>(
      `
      select id, experiment_name, objective, platforms, budget_mode, budget_cents, status, creative_count
      from public.marketing_ad_experiments
      where tenant_id = $1 and status <> 'archived'
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      platform: string;
      format: string;
      hook: string;
      angle: string;
      audience: string | null;
      status: string;
      predicted_score: number;
    }>(
      `
      select id, platform, format, hook, angle, audience, status, predicted_score
      from public.marketing_creative_variants
      where tenant_id = $1 and status <> 'archived'
      order by predicted_score desc, created_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      platform_key: string;
      display_name: string;
      strategy_summary: string;
      status: string;
      creative_rules_json: unknown[];
      next_review_on: Date | null;
    }>(
      `
      select id, platform_key, display_name, strategy_summary, status, creative_rules_json, next_review_on
      from public.marketing_platform_playbooks
      where status <> 'archived'
      order by display_name asc
      `
    ),
    queryPostgres<{
      id: string;
      platform_key: string;
      display_name: string;
      website_url: string;
      destination_type: string;
      connection_mode: string;
      status: string;
      notes: string;
    }>(
      `
      select id, platform_key, display_name, website_url, destination_type, connection_mode, status, notes
      from public.marketing_advertising_destinations
      where tenant_id = $1 and status <> 'archived'
      order by display_name asc
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
      videoJobs: num(metrics?.video_jobs),
      recommendations: num(metrics?.recommendations),
      memoryItems: num(metrics?.memory_items),
      adExperiments: num(metrics?.ad_experiments),
      creativeVariants: num(metrics?.creative_variants),
      platformPlaybooks: num(metrics?.platform_playbooks),
      advertisingDestinations: num(metrics?.advertising_destinations)
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
    recommendations: (recommendationResult?.rows ?? []).map((item) =>
      row(
        item.id,
        item.title,
        item.trigger_reason,
        item.status,
        `${item.primary_goal} / ${item.difficulty} difficulty / priority ${item.priority_score} / ${item.recommended_channels.join(", ") || "channels not selected"}`
      )
    ),
    memoryItems: (memoryResult?.rows ?? []).map((item) =>
      row(
        item.id,
        item.title,
        item.summary,
        item.status,
        `${item.memory_type.replaceAll("_", " ")} / score ${item.score}`
      )
    ),
    adExperiments: (adExperimentResult?.rows ?? []).map((experiment) =>
      row(
        experiment.id,
        experiment.experiment_name,
        experiment.objective.replaceAll("_", " "),
        experiment.status,
        `${experiment.platforms.join(", ") || "manual"} / ${experiment.creative_count} variant(s) / ${experiment.budget_mode.replaceAll("_", " ")} / $${(experiment.budget_cents / 100).toLocaleString()}`
      )
    ),
    creativeVariants: (creativeVariantResult?.rows ?? []).map((variant) =>
      row(
        variant.id,
        variant.hook,
        `${variant.angle}${variant.audience ? ` / ${variant.audience}` : ""}`,
        variant.status,
        `${variant.platform} / ${variant.format.replaceAll("_", " ")} / score ${variant.predicted_score}`
      )
    ),
    platformPlaybooks: (platformPlaybookResult?.rows ?? []).map((playbook) =>
      row(
        playbook.id,
        playbook.display_name,
        playbook.strategy_summary,
        playbook.status,
        `${playbook.platform_key} / ${playbook.creative_rules_json.length} rule(s) / review ${playbook.next_review_on ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(playbook.next_review_on)) : "not scheduled"}`
      )
    ),
    advertisingDestinations: (advertisingDestinationResult?.rows ?? []).map((destination) => ({
      id: destination.id,
      platformKey: destination.platform_key,
      displayName: destination.display_name,
      websiteUrl: destination.website_url,
      destinationType: destination.destination_type,
      connectionMode: destination.connection_mode
    })),
    advertisingDestinationRows: (advertisingDestinationResult?.rows ?? []).map((destination) =>
      row(
        destination.id,
        destination.display_name,
        destination.notes || destination.website_url,
        destination.status,
        `${destination.destination_type.replaceAll("_", " ")} / ${destination.connection_mode.replaceAll("_", " ")} / ${destination.website_url}`
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
      row(
        job.id,
        job.goal ?? "Video job",
        job.cta_text,
        job.status,
        `${job.metadata_json?.platform ?? job.provider_key} / ${job.metadata_json?.durationSeconds ?? "?"} sec / ${job.metadata_json?.creditRequiredForRendering ? "credits for render" : "brief only"} / ${job.service_label ?? "general"}`,
        `/app/marketing-os/video/${job.id}`
      )
    )
  };
}
