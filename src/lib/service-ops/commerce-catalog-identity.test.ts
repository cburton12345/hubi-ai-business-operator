import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/265_shared_commerce_catalog_identity.sql"), "utf8");

describe("shared commerce catalog identity", () => {
  it("uses one tenant-scoped canonical SKU for pricebook, inventory, and supplier products", () => {
    expect(migration).toContain("unique (tenant_id,normalized_sku)");
    expect(migration).toContain("pricebook_items_catalog_tenant_fk");
    expect(migration).toContain("service_inventory_items_catalog_tenant_fk");
    expect(migration).toContain("supplier_products_catalog_tenant_fk");
    expect(migration.match(/execute function public\.link_commerce_catalog_identity\(\)/g)).toHaveLength(3);
  });

  it("backfills existing SKU identities and preserves tenant isolation", () => {
    expect(migration).toContain("migration_265_backfill");
    expect(migration).toContain("source.tenant_id=catalog.tenant_id");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("public.has_tenant_role(tenant_id,array['owner','admin','operator'])");
  });
});
