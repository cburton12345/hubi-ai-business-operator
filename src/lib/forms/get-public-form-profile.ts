import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BusinessModel, RiskProfile } from "@/types/core";

export type PublicFormProfile = {
  publicKey: string;
  formName: string;
  brandName: string;
  brandSlug: string;
  businessModel: BusinessModel;
  industry: string;
  primaryGoal: string;
  riskProfile: RiskProfile;
  ctaGoals: string;
  toneOfVoice: string;
};

type FormProfileRow = {
  public_key: string;
  form_name: string;
  brand_name: string;
  brand_slug: string;
  business_model: BusinessModel;
  industry: string | null;
  primary_goal: string | null;
  risk_profile: RiskProfile;
  cta_goals: string | null;
  tone_of_voice: string | null;
};

function mapProfile(row: FormProfileRow): PublicFormProfile {
  return {
    publicKey: row.public_key,
    formName: row.form_name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    businessModel: row.business_model,
    industry: row.industry ?? "Business",
    primaryGoal: row.primary_goal ?? "Capture qualified requests.",
    riskProfile: row.risk_profile,
    ctaGoals: row.cta_goals ?? "Request information",
    toneOfVoice: row.tone_of_voice ?? "Direct, useful, and conversion-focused."
  };
}

export async function getPublicFormProfile(publicKey: string) {
  const supabase = createSupabaseAdminClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("forms")
      .select(
        `
        public_key,
        form_name:name,
        brands:brand_id(
          name,
          slug,
          business_model,
          industry,
          primary_goal,
          risk_profile,
          brand_marketing_settings(cta_goals, tone_of_voice)
        )
      `
      )
      .eq("public_key", publicKey)
      .eq("active", true)
      .maybeSingle();

    if (!error && data) {
      const brand = Array.isArray(data.brands) ? data.brands[0] : data.brands;
      const settings = Array.isArray(brand?.brand_marketing_settings)
        ? brand?.brand_marketing_settings[0]
        : brand?.brand_marketing_settings;

      if (brand) {
        return mapProfile({
          public_key: data.public_key,
          form_name: data.form_name,
          brand_name: brand.name,
          brand_slug: brand.slug,
          business_model: brand.business_model,
          industry: brand.industry,
          primary_goal: brand.primary_goal,
          risk_profile: brand.risk_profile,
          cta_goals: settings?.cta_goals ?? null,
          tone_of_voice: settings?.tone_of_voice ?? null
        });
      }
    }
  }

  const result = await queryPostgres<FormProfileRow>(
    `
    select
      f.public_key,
      f.name as form_name,
      b.name as brand_name,
      b.slug as brand_slug,
      b.business_model,
      b.industry,
      b.primary_goal,
      b.risk_profile,
      s.cta_goals,
      s.tone_of_voice
    from public.forms f
    join public.brands b on b.id = f.brand_id
    left join public.brand_marketing_settings s on s.brand_id = b.id
    where f.public_key = $1 and f.active = true
    limit 1
    `,
    [publicKey]
  );

  const row = result?.rows[0];
  return row ? mapProfile(row) : null;
}
