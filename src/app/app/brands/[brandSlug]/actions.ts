"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { brandProfileUpdateSchema, emptyToNull } from "@/lib/brands/brand-profile-schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

const operationSchema = z.object({
  brandId: z.string().uuid()
});

const serviceSchema = operationSchema.extend({
  name: z.string().min(1).max(160),
  description: z.string().max(600).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(10)
});

const locationSchema = operationSchema.extend({
  serviceAreaName: z.string().min(1).max(160),
  city: z.string().max(120).optional(),
  state: z.string().max(80).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(10)
});

const offerSchema = operationSchema.extend({
  title: z.string().min(1).max(180),
  description: z.string().max(800).optional()
});

const keywordSchema = operationSchema.extend({
  keyword: z.string().min(1).max(180),
  intent: z.enum(["service", "local", "comparison", "education", "brand", "commercial"]),
  priority: z.coerce.number().int().min(0).max(100).default(10)
});

const landingPageSchema = operationSchema.extend({
  title: z.string().min(1).max(180),
  pageType: z.enum(["landing_page", "city_page", "service_page", "homepage", "other"]),
  primaryKeyword: z.string().max(180).optional()
});

async function getBrandForOperation(brandId: string) {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ id: string; tenant_id: string; slug: string }>(
    "select id, tenant_id, slug from public.brands where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, brandId]
  );

  return result?.rows[0] ?? null;
}

export async function updateBrandProfile(formData: FormData) {
  await requirePermission("brand:manage");

  const parsed = brandProfileUpdateSchema.safeParse({
    brandId: formData.get("brandId"),
    name: formData.get("name"),
    domain: formData.get("domain") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    industry: formData.get("industry") ?? "",
    vertical: formData.get("vertical") ?? "",
    description: formData.get("description") ?? "",
    primaryGoal: formData.get("primaryGoal") ?? "",
    primaryLocation: formData.get("primaryLocation") ?? "",
    riskProfile: formData.get("riskProfile"),
    status: formData.get("status"),
    targetCustomers: formData.get("targetCustomers") ?? "",
    ctaGoals: formData.get("ctaGoals") ?? "",
    adGoals: formData.get("adGoals") ?? "",
    seoTargets: formData.get("seoTargets") ?? "",
    reviewStrategy: formData.get("reviewStrategy") ?? "",
    followUpStrategy: formData.get("followUpStrategy") ?? "",
    toneOfVoice: formData.get("toneOfVoice") ?? "",
    approvalMode: formData.get("approvalMode")
  });

  if (!parsed.success) {
    return;
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const brandResult = await queryPostgres<{ id: string; tenant_id: string; slug: string }>(
      `
      update public.brands
      set
        name = $2,
        domain = $3,
        phone = $4,
        email = $5,
        logo_url = $6,
        industry = $7,
        vertical = $8,
        description = $9,
        primary_goal = $10,
        primary_location = $11,
        risk_profile = $12,
        status = $13,
        updated_at = now()
      where id = $1
      returning id, tenant_id, slug
      `,
      [
        parsed.data.brandId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.domain),
        emptyToNull(parsed.data.phone),
        emptyToNull(parsed.data.email),
        emptyToNull(parsed.data.logoUrl),
        emptyToNull(parsed.data.industry),
        emptyToNull(parsed.data.vertical),
        emptyToNull(parsed.data.description),
        emptyToNull(parsed.data.primaryGoal),
        emptyToNull(parsed.data.primaryLocation),
        parsed.data.riskProfile,
        parsed.data.status
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
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      on conflict (brand_id) do update
      set
        target_customers = excluded.target_customers,
        cta_goals = excluded.cta_goals,
        ad_goals = excluded.ad_goals,
        seo_targets = excluded.seo_targets,
        review_strategy = excluded.review_strategy,
        follow_up_strategy = excluded.follow_up_strategy,
        tone_of_voice = excluded.tone_of_voice,
        approval_mode = excluded.approval_mode,
        updated_at = now()
      `,
      [
        brand.tenant_id,
        brand.id,
        emptyToNull(parsed.data.targetCustomers),
        emptyToNull(parsed.data.ctaGoals),
        emptyToNull(parsed.data.adGoals),
        emptyToNull(parsed.data.seoTargets),
        emptyToNull(parsed.data.reviewStrategy),
        emptyToNull(parsed.data.followUpStrategy),
        emptyToNull(parsed.data.toneOfVoice),
        parsed.data.approvalMode
      ]
    );

    await queryPostgres(
      `
      insert into public.activity_logs (
        tenant_id,
        brand_id,
        actor_type,
        action,
        target_type,
        target_id,
        metadata_json
      )
      values ($1, $2, 'user', 'brand.profile_updated', 'brand', $2, $3::jsonb)
      `,
      [
        brand.tenant_id,
        brand.id,
        JSON.stringify({
          updatedFields: Object.keys(parsed.data).filter((key) => key !== "brandId")
        })
      ]
    );

    revalidatePath("/app/brands");
    revalidatePath(`/app/brands/${brand.slug}`);
    revalidatePath("/app/tasks");
    redirect(`/app/brands/${brand.slug}?saved=1`);
  }

  const input = parsed.data;

  const { data: brand, error } = await supabase
    .from("brands")
    .update({
      name: input.name.trim(),
      domain: emptyToNull(input.domain),
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      logo_url: emptyToNull(input.logoUrl),
      industry: emptyToNull(input.industry),
      vertical: emptyToNull(input.vertical),
      description: emptyToNull(input.description),
      primary_goal: emptyToNull(input.primaryGoal),
      primary_location: emptyToNull(input.primaryLocation),
      risk_profile: input.riskProfile,
      status: input.status,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.brandId)
    .select("id, tenant_id, slug")
    .single<{ id: string; tenant_id: string; slug: string }>();

  if (error || !brand) {
    return;
  }

  await supabase.from("brand_marketing_settings").upsert(
    {
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      target_customers: emptyToNull(input.targetCustomers),
      cta_goals: emptyToNull(input.ctaGoals),
      ad_goals: emptyToNull(input.adGoals),
      seo_targets: emptyToNull(input.seoTargets),
      review_strategy: emptyToNull(input.reviewStrategy),
      follow_up_strategy: emptyToNull(input.followUpStrategy),
      tone_of_voice: emptyToNull(input.toneOfVoice),
      approval_mode: input.approvalMode,
      updated_at: new Date().toISOString()
    },
    { onConflict: "brand_id" }
  );

  await supabase.from("activity_logs").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    actor_type: "user",
    action: "brand.profile_updated",
    target_type: "brand",
    target_id: brand.id,
    metadata_json: {
      updatedFields: Object.keys(input).filter((key) => key !== "brandId")
    }
  });

  revalidatePath("/app/brands");
  revalidatePath(`/app/brands/${brand.slug}`);
  revalidatePath("/app/tasks");
  redirect(`/app/brands/${brand.slug}?saved=1`);
}

export async function addBrandServiceAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = serviceSchema.safeParse({
    brandId: formData.get("brandId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priority: formData.get("priority") ?? 10
  });
  if (!parsed.success) return;
  const brand = await getBrandForOperation(parsed.data.brandId);
  if (!brand) return;

  await queryPostgres(
    `
    insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
    values ($1, $2, $3, $4, $5, $6, true)
    on conflict (brand_id, slug) do update
    set name = excluded.name, description = excluded.description, priority = excluded.priority, active = true
    `,
    [brand.tenant_id, brand.id, parsed.data.name, slugify(parsed.data.name), emptyToNull(parsed.data.description), parsed.data.priority]
  );
  revalidatePath(`/app/brands/${brand.slug}`);
}

export async function addBrandLocationAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = locationSchema.safeParse({
    brandId: formData.get("brandId"),
    serviceAreaName: formData.get("serviceAreaName"),
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    priority: formData.get("priority") ?? 10
  });
  if (!parsed.success) return;
  const brand = await getBrandForOperation(parsed.data.brandId);
  if (!brand) return;

  await queryPostgres(
    `
    insert into public.brand_locations (tenant_id, brand_id, service_area_name, city, state, priority, active)
    values ($1, $2, $3, $4, $5, $6, true)
    `,
    [brand.tenant_id, brand.id, parsed.data.serviceAreaName, emptyToNull(parsed.data.city), emptyToNull(parsed.data.state), parsed.data.priority]
  );
  revalidatePath(`/app/brands/${brand.slug}`);
}

export async function addBrandOfferAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = offerSchema.safeParse({
    brandId: formData.get("brandId"),
    title: formData.get("title"),
    description: formData.get("description") ?? ""
  });
  if (!parsed.success) return;
  const brand = await getBrandForOperation(parsed.data.brandId);
  if (!brand) return;

  await queryPostgres(
    "insert into public.brand_offers (tenant_id, brand_id, title, description, active) values ($1, $2, $3, $4, true)",
    [brand.tenant_id, brand.id, parsed.data.title, emptyToNull(parsed.data.description)]
  );
  revalidatePath(`/app/brands/${brand.slug}`);
}

export async function addBrandKeywordAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = keywordSchema.safeParse({
    brandId: formData.get("brandId"),
    keyword: formData.get("keyword"),
    intent: formData.get("intent"),
    priority: formData.get("priority") ?? 10
  });
  if (!parsed.success) return;
  const brand = await getBrandForOperation(parsed.data.brandId);
  if (!brand) return;

  await queryPostgres(
    `
    insert into public.brand_seo_keywords (tenant_id, brand_id, keyword, intent, priority)
    values ($1, $2, $3, $4, $5)
    on conflict (brand_id, keyword) do update
    set intent = excluded.intent, priority = excluded.priority
    `,
    [brand.tenant_id, brand.id, parsed.data.keyword, parsed.data.intent, parsed.data.priority]
  );
  revalidatePath(`/app/brands/${brand.slug}`);
}

export async function addBrandLandingPageAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = landingPageSchema.safeParse({
    brandId: formData.get("brandId"),
    title: formData.get("title"),
    pageType: formData.get("pageType"),
    primaryKeyword: formData.get("primaryKeyword") ?? ""
  });
  if (!parsed.success) return;
  const brand = await getBrandForOperation(parsed.data.brandId);
  if (!brand) return;

  await queryPostgres(
    `
    insert into public.brand_landing_pages (tenant_id, brand_id, title, slug, page_type, primary_keyword, status)
    values ($1, $2, $3, $4, $5, $6, 'planned')
    on conflict (brand_id, slug) do update
    set title = excluded.title, page_type = excluded.page_type, primary_keyword = excluded.primary_keyword
    `,
    [brand.tenant_id, brand.id, parsed.data.title, slugify(parsed.data.title), parsed.data.pageType, emptyToNull(parsed.data.primaryKeyword)]
  );
  revalidatePath(`/app/brands/${brand.slug}`);
}
