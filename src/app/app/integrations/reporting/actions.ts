"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { listGa4Properties, listSearchConsoleSites, readGa4Daily, readSearchConsoleDaily } from "@/lib/integrations/google-reporting";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type ReportingProvider = "search_console" | "analytics";

function providerFrom(value: FormDataEntryValue | null): ReportingProvider | null {
  return value === "search_console" || value === "analytics" ? value : null;
}

export async function discoverGoogleReportingResourcesAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const provider = providerFrom(formData.get("provider"));
  if (!provider) return;
  try {
    const token = await getFreshProviderAccessToken(workspaceId, provider);
    const resources = provider === "search_console" ? await listSearchConsoleSites(token) : await listGa4Properties(token);
    for (const resource of resources) {
      await queryPostgres(
        `insert into public.provider_reporting_resources
         (tenant_id, provider_key, resource_type, external_id, display_name, metadata_json)
         values ($1,$2,$3,$4,$5,$6::jsonb)
         on conflict (tenant_id, provider_key, external_id) do update set
           display_name=excluded.display_name, metadata_json=public.provider_reporting_resources.metadata_json || excluded.metadata_json,
           status=case when public.provider_reporting_resources.selected then 'selected' else 'available' end,
           last_error=null, updated_at=now()`,
        [workspaceId, provider, resource.resourceType, resource.externalId, resource.displayName, JSON.stringify(resource.metadata)]
      );
    }
  } catch (error) {
    await queryPostgres(
      `update public.integration_connections set status='error', metadata_json=metadata_json || $3::jsonb, updated_at=now()
       where tenant_id=$1 and provider=$2`,
      [workspaceId, provider, JSON.stringify({ reportingDiscoveryError: error instanceof Error ? error.message : "Discovery failed" })]
    );
  }
  revalidatePath("/app/integrations/reporting");
}

export async function selectGoogleReportingResourceAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const provider = providerFrom(formData.get("provider"));
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!provider || !resourceId) return;
  await queryPostgres(`update public.provider_reporting_resources set selected=false, status='available', updated_at=now() where tenant_id=$1 and provider_key=$2`, [workspaceId, provider]);
  await queryPostgres(`update public.provider_reporting_resources set selected=true, status='selected', updated_at=now() where tenant_id=$1 and provider_key=$2 and id=$3`, [workspaceId, provider, resourceId]);
  revalidatePath("/app/integrations/reporting");
}

export async function syncGoogleReportingResourceAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const provider = providerFrom(formData.get("provider"));
  if (!provider) return;
  const result = await queryPostgres<{ id: string; external_id: string }>(
    `select id, external_id from public.provider_reporting_resources where tenant_id=$1 and provider_key=$2 and selected=true limit 1`,
    [workspaceId, provider]
  );
  const resource = result?.rows[0];
  if (!resource) return;
  const end = new Date();
  const start = new Date(end.getTime() - 27 * 86_400_000);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = start.toISOString().slice(0, 10);
  try {
    const token = await getFreshProviderAccessToken(workspaceId, provider);
    const rows = provider === "search_console"
      ? await readSearchConsoleDaily({ accessToken: token, siteUrl: resource.external_id, startDate, endDate })
      : await readGa4Daily({ accessToken: token, propertyId: resource.external_id, startDate, endDate });
    for (const row of rows) {
      await queryPostgres(
        `insert into public.provider_reporting_metrics_daily
         (tenant_id, resource_id, provider_key, metric_date, metrics_json)
         values ($1,$2,$3,$4::date,$5::jsonb)
         on conflict (resource_id, metric_date, dimension_key, dimension_value) do update set metrics_json=excluded.metrics_json, updated_at=now()`,
        [workspaceId, resource.id, provider, row.date, JSON.stringify(row.metrics)]
      );
    }
    await queryPostgres(`update public.provider_reporting_resources set last_synced_at=now(), last_error=null, status='selected', updated_at=now() where tenant_id=$1 and id=$2`, [workspaceId, resource.id]);
  } catch (error) {
    await queryPostgres(`update public.provider_reporting_resources set last_error=$3, status='needs_attention', updated_at=now() where tenant_id=$1 and id=$2`, [workspaceId, resource.id, error instanceof Error ? error.message : "Sync failed"]);
  }
  revalidatePath("/app/integrations/reporting");
  revalidatePath("/app/reports");
}
