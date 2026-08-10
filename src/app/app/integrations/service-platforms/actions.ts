"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { servicePlatformProviders } from "@/lib/integrations/service-platform-bridge";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { revalidatePath } from "next/cache";
import { syncJobberReadModel } from "@/lib/integrations/jobber/read-model";

const providerSchema = z.enum(servicePlatformProviders);

export async function createServicePlatformBridgeAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerSchema.safeParse(formData.get("providerKey"));
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const secret = randomSessionToken();
  const appUrl = (env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live").replace(/\/$/, "");
  const endpointResult = await queryPostgres<{ id: string }>(
    `insert into public.webhook_endpoints (tenant_id,name,url,direction,event_types_json,status,signing_secret_hint,inbound_token_hash,provider_key,connection_mode,metadata_json)
     values ($1,$2,$3,'inbound','["contact","lead","job"]'::jsonb,'active','token-created-copy-now',$4,$5,'middleware_bridge',$6::jsonb) returning id`,
    [tenantId, `${parsed.data} coexistence bridge`, `${appUrl}/api/integrations/service-platform/pending`, hashSessionToken(secret), parsed.data, JSON.stringify({ ownership: "provider_reads_ferocity_operates", deletes: "detach_only" })]
  );
  const endpointId = endpointResult?.rows[0]?.id;
  if (!endpointId) return;
  const url = `${appUrl}/api/integrations/service-platform/${endpointId}`;
  await queryPostgres("update public.webhook_endpoints set url=$2 where id=$1", [endpointId, url]);
  await queryPostgres(
    `insert into public.integration_connections (tenant_id,provider,display_name,status,credentials_status,scopes_json,metadata_json,last_checked_at)
     values ($1,$2,$3,'connected','configured','["contacts:read","leads:read","jobs:read"]'::jsonb,$4::jsonb,now())
     on conflict (tenant_id,provider) do update set status='connected',credentials_status='configured',metadata_json=public.integration_connections.metadata_json || excluded.metadata_json,updated_at=now()`,
    [tenantId, parsed.data, `${parsed.data.replaceAll("_", " ")} coexistence`, JSON.stringify({ connectionMode: "middleware_bridge", writeBackEnabled: false, endpointId })]
  );
  redirect(`/app/integrations/service-platforms?endpoint=${endpointId}&token=${encodeURIComponent(secret)}`);
}

export async function syncJobberReadModelAction() {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  await syncJobberReadModel({ tenantId });
  revalidatePath("/app/integrations/service-platforms");
}
