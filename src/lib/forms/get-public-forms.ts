import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type PublicFormRow = {
  id: string;
  brandName: string;
  brandSlug: string;
  name: string;
  slug: string;
  publicKey: string;
  active: boolean;
  lastRotatedAt: string;
  lastRotatedBy: string;
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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      brand_slug: string;
      name: string;
      slug: string;
      public_key: string;
      active: boolean;
      last_rotated_at: string | null;
      last_rotated_by: string | null;
    }>(
      `
      select
        f.id,
        b.name as brand_name,
        b.slug as brand_slug,
        f.name,
        f.slug,
        f.public_key,
        f.active,
        r.rotated_at as last_rotated_at,
        u.email as last_rotated_by
      from public.forms f
      join public.brands b on b.id = f.brand_id
      left join lateral (
        select rotated_at, rotated_by_user_id
        from public.form_key_rotations
        where tenant_id = f.tenant_id and form_id = f.id
        order by rotated_at desc
        limit 1
      ) r on true
      left join public.users u on u.id = r.rotated_by_user_id
      where f.tenant_id = $1
      order by f.slug
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((form) => ({
        id: form.id,
        brandName: form.brand_name,
        brandSlug: form.brand_slug,
        name: form.name,
        slug: form.slug,
        publicKey: form.public_key,
        active: form.active,
        lastRotatedAt: form.last_rotated_at ?? "",
        lastRotatedBy: form.last_rotated_by ?? "Not rotated"
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
        active: true,
        lastRotatedAt: "",
        lastRotatedBy: "Not rotated"
      }
    ];
  }

  const { data, error } = await supabase
    .from("forms")
    .select("id, name, slug, public_key, active, brands:brand_id(name, slug)")
    .eq("tenant_id", workspaceId)
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
      active: form.active,
      lastRotatedAt: "",
      lastRotatedBy: "Not rotated"
    };
  });
}
