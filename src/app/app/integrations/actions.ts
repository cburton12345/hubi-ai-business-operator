"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const integrationToggleSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["planned", "paused", "connected"]),
  liveActionsEnabled: z.enum(["false", "true"]).default("false")
});

const providerRequestSchema = z.object({
  providerName: z.string().trim().min(2).max(120),
  providerUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  capabilityCategory: z.enum(["sms", "voice", "video", "image", "email", "storage", "payments", "accounting", "calendar", "advertising", "other"]),
  useCase: z.string().trim().min(10).max(1500),
  currentlyUsing: z.enum(["true", "false"]).default("false")
});

export async function requestProviderIntegrationAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = providerRequestSchema.safeParse({
    providerName: formData.get("providerName"),
    providerUrl: formData.get("providerUrl") ?? "",
    capabilityCategory: formData.get("capabilityCategory"),
    useCase: formData.get("useCase"),
    currentlyUsing: formData.get("currentlyUsing") ?? "false"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  await queryPostgres(
    `
    insert into public.provider_integration_requests (
      tenant_id, requested_by_user_id, provider_name, provider_url,
      capability_category, use_case, currently_using, metadata_json
    )
    values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $8::jsonb)
    on conflict (tenant_id, provider_name, capability_category) do update
    set provider_url = coalesce(excluded.provider_url, public.provider_integration_requests.provider_url),
        use_case = excluded.use_case,
        currently_using = public.provider_integration_requests.currently_using or excluded.currently_using,
        request_count = public.provider_integration_requests.request_count + 1,
        status = case when public.provider_integration_requests.status = 'declined' then 'requested' else public.provider_integration_requests.status end,
        metadata_json = public.provider_integration_requests.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      tenantId,
      session?.userId ?? null,
      parsed.data.providerName,
      parsed.data.providerUrl,
      parsed.data.capabilityCategory,
      parsed.data.useCase,
      parsed.data.currentlyUsing === "true",
      JSON.stringify({ source: "integrations_provider_request" })
    ]
  );
  revalidatePath("/app/integrations");
}

export async function updateIntegrationReadinessAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = integrationToggleSchema.safeParse({
    connectionId: formData.get("connectionId"),
    status: formData.get("status"),
    liveActionsEnabled: formData.get("liveActionsEnabled") ?? "false"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const updated = await queryPostgres<{ provider: string; display_name: string }>(
    `
    update public.integration_connections
    set status = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning provider, display_name
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      parsed.data.status,
      JSON.stringify({
        liveActionsEnabled: parsed.data.liveActionsEnabled === "true",
        manuallyReviewedAt: new Date().toISOString()
      })
    ]
  );
  const connection = updated?.rows[0];

  if (connection) {
    await queryPostgres(
      `
      update public.provider_connection_lanes
      set connection_status = case
            when $3 = 'connected' then 'connected'
            when $3 = 'paused' then 'paused'
            else 'not_connected'
          end,
          credentials_status = case when $3 = 'connected' then 'configured' else credentials_status end,
          live_actions_enabled = false,
          source = 'manual',
          plain_language_status = case
            when $3 = 'connected' then display_name || ' is marked connected in Ferocity. Live actions still require approval controls.'
            when $3 = 'paused' then display_name || ' is paused. Ferocity will keep drafts and queues available.'
            else display_name || ' is planned and waiting for credentials.'
          end,
          updated_at = now()
      where tenant_id = $1 and provider_key = $2
      `,
      [workspaceId, connection.provider, parsed.data.status]
    );
  }

  revalidatePath("/app/integrations");
  revalidatePath("/app/credentials");
  revalidatePath("/app/ai-workforce/results/latest");
}
