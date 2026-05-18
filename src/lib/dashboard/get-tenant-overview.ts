import { internalBrands } from "@/lib/dashboard/demo-data";

export async function getTenantOverview(tenantSlug: string) {
  if (tenantSlug !== "internal-portfolio") {
    return null;
  }

  return {
    name: "Internal Portfolio",
    slug: tenantSlug,
    brands: internalBrands
  };
}
