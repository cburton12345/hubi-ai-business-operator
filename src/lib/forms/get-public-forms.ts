import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";

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
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      brand_slug: string;
      name: string;
      slug: string;
      public_key: string;
      active: boolean;
    }>(
      `
      select
        f.id,
        b.name as brand_name,
        b.slug as brand_slug,
        f.name,
        f.slug,
        f.public_key,
        f.active
      from public.forms f
      join public.brands b on b.id = f.brand_id
      where f.tenant_id = $1
      order by f.slug
      `,
      [internalTenantId]
    );

    if (result) {
      return result.rows.map((form) => ({
        id: form.id,
        brandName: form.brand_name,
        brandSlug: form.brand_slug,
        name: form.name,
        slug: form.slug,
        publicKey: form.public_key,
        active: form.active
      }));
    }

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
