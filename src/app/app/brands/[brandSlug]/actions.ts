"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { brandProfileUpdateSchema, emptyToNull } from "@/lib/brands/brand-profile-schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function updateBrandProfile(formData: FormData) {
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
    return;
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
