import { queryPostgres } from "@/lib/db/postgres";
import type { TenantRole } from "@/types/core";

export async function getBrandAccessRole(workspaceId: string, brandId: string, userId: string): Promise<TenantRole | null> {
  const result = await queryPostgres<{ role: TenantRole }>(
    `
    select role
    from public.brand_user_access
    where tenant_id = $1 and brand_id = $2 and user_id = $3 and status = 'active'
    limit 1
    `,
    [workspaceId, brandId, userId]
  );

  return result?.rows[0]?.role ?? null;
}
