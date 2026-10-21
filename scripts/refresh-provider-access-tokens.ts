import { queryPostgres } from "@/lib/db/postgres";
import { refreshDueProviderCredentialsForTenant } from "@/lib/integrations/credential-maintenance";

const tenantId = process.env.CREDENTIAL_HEALTH_TENANT_ID?.trim() || null;
async function main() {
  const result = await queryPostgres<{ tenant_id: string }>(
    `select id as tenant_id from public.tenants where ($1::uuid is null or id=$1::uuid) order by id`,
    [tenantId],
  );

  const outcomes = [];
  for (const row of result?.rows ?? []) {
    outcomes.push({
      tenantId: row.tenant_id,
      ...(await refreshDueProviderCredentialsForTenant(row.tenant_id, { limit: 25 })),
    });
  }

  console.log(JSON.stringify({ tenantsChecked: outcomes.length, outcomes }, null, 2));
  if (outcomes.some((outcome) => outcome.failed > 0)) process.exitCode = 2;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Credential refresh failed.");
  process.exitCode = 1;
});
