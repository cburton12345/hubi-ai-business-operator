import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

export type PublicFormRow = {
  id: string;
  brandName: string;
  brandSlug: string;
  name: string;
  slug: string;
  publicKey: string;
  active: boolean;
};

type FormRow = {
  id: string;
  name: string;
  slug: string;
  public_key: string;
  active: boolean;
  brands:
    | {
        name: string;
        slug: string;
      }
    | {
        name: string;
        slug: string;
      }[]
    | null;
};

export async function getPublicFormRows(): Promise<PublicFormRow[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return [
      {
        id: "demo-ferocity-form",
        brandName: "Ferocity",
        brandSlug: "ferocity",
        name: "Primary Lead Form",
        slug: "primary-lead-form",
        publicKey: "internal-ferocity-primary-lead-form",
        active: true
      }
    ];
  }

  const { data, error } = await supabase
    .from("forms")
    .select("id, name, slug, public_key, active, brands:brand_id(name, slug)")
    .eq("tenant_id", internalTenantId)
    .order("slug");

  if (error || !data) {
    return [];
  }

  return (data as FormRow[]).map((form) => {
    const brand = Array.isArray(form.brands) ? form.brands[0] : form.brands;

    return {
      id: form.id,
      brandName: brand?.name ?? "Unknown brand",
      brandSlug: brand?.slug ?? "",
      name: form.name,
      slug: form.slug,
      publicKey: form.public_key,
      active: form.active
    };
  });
}
