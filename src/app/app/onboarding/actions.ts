"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queryPostgres } from "@/lib/db/postgres";
import {
  emptyToNull,
  parseLines,
  parseNameDescriptionLines,
  slugify,
  workspaceOnboardingSchema
} from "@/lib/onboarding/workspace-onboarding-schema";

function checkbox(value: FormDataEntryValue | null) {
  return value === "on";
}

function keywordIntent(index: number) {
  if (index === 0) return "service";
  if (index === 1) return "local";
  return "commercial";
}

function pageType(line: string) {
  const lower = line.toLowerCase();
  if (lower.includes("city")) return "city_page";
  if (lower.includes("service")) return "service_page";
  if (lower.includes("home")) return "homepage";
  return "landing_page";
}

export async function createWorkspaceOnboardingAction(formData: FormData) {
  const parsed = workspaceOnboardingSchema.safeParse({
    organizationName: formData.get("organizationName"),
    workspaceSlug: formData.get("workspaceSlug") ?? "",
    brandName: formData.get("brandName"),
    businessModel: formData.get("businessModel"),
    domain: formData.get("domain") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    industry: formData.get("industry") ?? "",
    vertical: formData.get("vertical") ?? "",
    primaryLocation: formData.get("primaryLocation") ?? "",
    primaryGoal: formData.get("primaryGoal") ?? "",
    description: formData.get("description") ?? "",
    targetCustomers: formData.get("targetCustomers") ?? "",
    ctaGoals: formData.get("ctaGoals") ?? "",
    toneOfVoice: formData.get("toneOfVoice") ?? "",
    adGoals: formData.get("adGoals") ?? "",
    reviewStrategy: formData.get("reviewStrategy") ?? "",
    followUpStrategy: formData.get("followUpStrategy") ?? "",
    riskProfile: formData.get("riskProfile"),
    approvalMode: formData.get("approvalMode"),
    services: formData.get("services") ?? "",
    serviceAreas: formData.get("serviceAreas") ?? "",
    offers: formData.get("offers") ?? "",
    seoKeywords: formData.get("seoKeywords") ?? "",
    landingPages: formData.get("landingPages") ?? "",
    autoCreateLowRiskDrafts: checkbox(formData.get("autoCreateLowRiskDrafts")),
    autoWeeklySeoPosts: checkbox(formData.get("autoWeeklySeoPosts")),
    autoGbpPostDrafts: checkbox(formData.get("autoGbpPostDrafts")),
    autoFacebookPostDrafts: checkbox(formData.get("autoFacebookPostDrafts")),
    autoReviewRequestDrafts: checkbox(formData.get("autoReviewRequestDrafts")),
    autoFollowUpDrafts: checkbox(formData.get("autoFollowUpDrafts")),
    autoLandingPageSuggestions: checkbox(formData.get("autoLandingPageSuggestions"))
  });

  if (!parsed.success) {
    return;
  }

  const input = parsed.data;
  const workspaceSlug = slugify(input.workspaceSlug || input.organizationName);
  const brandSlug = slugify(input.brandName);
  const publicKey = `${workspaceSlug}-${brandSlug}-primary-lead-form`;

  const workspaceResult = await queryPostgres<{ id: string; slug: string }>(
    `
    insert into public.tenants (name, slug, account_type, status, billing_status, plan_key, onboarding_status, onboarding_completed_at)
    values ($1, $2, 'customer', 'trial', 'trialing', 'starter', 'completed', now())
    on conflict (slug) do update
    set name = excluded.name,
        account_type = 'customer',
        status = case when public.tenants.status = 'archived' then 'trial' else public.tenants.status end,
        onboarding_status = 'completed',
        onboarding_completed_at = now(),
        updated_at = now()
    returning id, slug
    `,
    [input.organizationName.trim(), workspaceSlug]
  );
  const workspace = workspaceResult?.rows[0];

  if (!workspace) {
    return;
  }

  const brandResult = await queryPostgres<{ id: string; slug: string }>(
    `
    insert into public.brands (
      tenant_id,
      name,
      slug,
      domain,
      phone,
      email,
      business_model,
      industry,
      vertical,
      description,
      primary_goal,
      primary_location,
      risk_profile,
      status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
    on conflict (tenant_id, slug) do update
    set name = excluded.name,
        domain = excluded.domain,
        phone = excluded.phone,
        email = excluded.email,
        business_model = excluded.business_model,
        industry = excluded.industry,
        vertical = excluded.vertical,
        description = excluded.description,
        primary_goal = excluded.primary_goal,
        primary_location = excluded.primary_location,
        risk_profile = excluded.risk_profile,
        status = 'active',
        updated_at = now()
    returning id, slug
    `,
    [
      workspace.id,
      input.brandName.trim(),
      brandSlug,
      emptyToNull(input.domain),
      emptyToNull(input.phone),
      emptyToNull(input.email),
      input.businessModel,
      emptyToNull(input.industry),
      emptyToNull(input.vertical),
      emptyToNull(input.description),
      emptyToNull(input.primaryGoal),
      emptyToNull(input.primaryLocation),
      input.riskProfile
    ]
  );
  const brand = brandResult?.rows[0];

  if (!brand) {
    return;
  }

  await queryPostgres(
    `
    insert into public.brand_marketing_settings (
      tenant_id,
      brand_id,
      target_customers,
      cta_goals,
      ad_goals,
      seo_targets,
      review_strategy,
      follow_up_strategy,
      tone_of_voice,
      approval_mode,
      auto_create_low_risk_drafts,
      auto_weekly_seo_posts,
      auto_gbp_post_drafts,
      auto_facebook_post_drafts,
      auto_review_request_drafts,
      auto_follow_up_drafts,
      auto_landing_page_suggestions,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
    on conflict (brand_id) do update
    set target_customers = excluded.target_customers,
        cta_goals = excluded.cta_goals,
        ad_goals = excluded.ad_goals,
        seo_targets = excluded.seo_targets,
        review_strategy = excluded.review_strategy,
        follow_up_strategy = excluded.follow_up_strategy,
        tone_of_voice = excluded.tone_of_voice,
        approval_mode = excluded.approval_mode,
        auto_create_low_risk_drafts = excluded.auto_create_low_risk_drafts,
        auto_weekly_seo_posts = excluded.auto_weekly_seo_posts,
        auto_gbp_post_drafts = excluded.auto_gbp_post_drafts,
        auto_facebook_post_drafts = excluded.auto_facebook_post_drafts,
        auto_review_request_drafts = excluded.auto_review_request_drafts,
        auto_follow_up_drafts = excluded.auto_follow_up_drafts,
        auto_landing_page_suggestions = excluded.auto_landing_page_suggestions,
        updated_at = now()
    `,
    [
      workspace.id,
      brand.id,
      emptyToNull(input.targetCustomers),
      emptyToNull(input.ctaGoals),
      emptyToNull(input.adGoals),
      emptyToNull(input.seoKeywords),
      emptyToNull(input.reviewStrategy),
      emptyToNull(input.followUpStrategy),
      emptyToNull(input.toneOfVoice),
      input.approvalMode,
      input.autoCreateLowRiskDrafts,
      input.autoWeeklySeoPosts,
      input.autoGbpPostDrafts,
      input.autoFacebookPostDrafts,
      input.autoReviewRequestDrafts,
      input.autoFollowUpDrafts,
      input.autoLandingPageSuggestions
    ]
  );

  await queryPostgres("delete from public.brand_locations where tenant_id = $1 and brand_id = $2", [workspace.id, brand.id]);
  await queryPostgres("delete from public.brand_offers where tenant_id = $1 and brand_id = $2", [workspace.id, brand.id]);

  for (const [index, service] of parseNameDescriptionLines(input.services).entries()) {
    const slug = slugify(service.name);
    await queryPostgres(
      `
      insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
      values ($1, $2, $3, $4, $5, $6, true)
      on conflict (brand_id, slug) do update
      set name = excluded.name, description = excluded.description, priority = excluded.priority, active = true
      `,
      [workspace.id, brand.id, service.name, slug, service.description, 100 - index]
    );
  }

  for (const [index, area] of parseLines(input.serviceAreas).entries()) {
    const [city, state] = area.split(",").map((part) => part.trim());
    await queryPostgres(
      `
      insert into public.brand_locations (tenant_id, brand_id, city, state, service_area_name, priority, active)
      values ($1, $2, $3, $4, $5, $6, true)
      `,
      [workspace.id, brand.id, city || null, state || null, area, 100 - index]
    );
  }

  for (const offer of parseNameDescriptionLines(input.offers)) {
    await queryPostgres(
      `
      insert into public.brand_offers (tenant_id, brand_id, title, description, active)
      values ($1, $2, $3, $4, true)
      `,
      [workspace.id, brand.id, offer.name, offer.description]
    );
  }

  for (const [index, keyword] of parseLines(input.seoKeywords).entries()) {
    await queryPostgres(
      `
      insert into public.brand_seo_keywords (tenant_id, brand_id, keyword, intent, priority)
      values ($1, $2, $3, $4, $5)
      on conflict (brand_id, keyword) do update
      set intent = excluded.intent, priority = excluded.priority
      `,
      [workspace.id, brand.id, keyword, keywordIntent(index), 100 - index]
    );
  }

  for (const page of parseLines(input.landingPages)) {
    const slug = slugify(page);
    await queryPostgres(
      `
      insert into public.brand_landing_pages (tenant_id, brand_id, title, slug, page_type, primary_keyword, status)
      values ($1, $2, $3, $4, $5, $6, 'planned')
      on conflict (brand_id, slug) do update
      set title = excluded.title, page_type = excluded.page_type, primary_keyword = excluded.primary_keyword, status = excluded.status
      `,
      [workspace.id, brand.id, page, slug, pageType(page), parseLines(input.seoKeywords)[0] ?? null]
    );
  }

  await queryPostgres(
    `
    insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
    values ($1, $2, 'Primary Lead Form', 'primary-lead-form', $3, true)
    on conflict (brand_id, slug) do update
    set name = excluded.name, public_key = excluded.public_key, active = true
    `,
    [workspace.id, brand.id, publicKey]
  );

  await queryPostgres(
    `
    insert into public.workspace_onboarding_events (tenant_id, brand_id, step_key, status, notes, metadata_json)
    values
      ($1, $2, 'workspace_created', 'completed', 'Organization workspace created or refreshed.', $3::jsonb),
      ($1, $2, 'brand_profile_created', 'completed', 'Primary brand profile captured.', $3::jsonb),
      ($1, $2, 'marketing_context_created', 'completed', 'Services, areas, offers, SEO keywords, landing pages, and automation settings captured.', $3::jsonb),
      ($1, $2, 'lead_form_created', 'completed', 'Primary public lead form prepared.', $3::jsonb)
    `,
    [workspace.id, brand.id, JSON.stringify({ source: "phase3_onboarding", publicKey })]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'user', 'workspace.onboarded', 'tenant', $1, $3::jsonb)
    `,
    [workspace.id, brand.id, JSON.stringify({ workspaceSlug, brandSlug, publicKey })]
  );

  revalidatePath("/app");
  revalidatePath("/app/onboarding");
  revalidatePath("/app/tenants");
  revalidatePath(`/app/tenant/${workspace.slug}`);
  redirect(`/app/tenant/${workspace.slug}?onboarded=1`);
}
