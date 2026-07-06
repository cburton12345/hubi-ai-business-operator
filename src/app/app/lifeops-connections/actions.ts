"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const updateSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["planned", "connected", "paused", "needs_attention", "archived"])
});

const createSchema = z.object({
  platformKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  platformName: z.string().trim().min(2).max(120),
  platformType: z.enum(["business", "marketplace", "software", "personal", "safety", "finance", "property", "operations"]),
  ownerLayer: z.enum(["owner_command", "personal_ops", "both"]).default("owner_command"),
  externalBaseUrl: z.string().trim().url().optional().or(z.literal("")),
  eventScope: z.string().trim().max(600).optional(),
  notes: z.string().trim().max(700).optional()
});

export async function updateLifeOpsConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = updateSchema.safeParse({
    connectionId: formData.get("connectionId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.owner_platform_connections
    set connection_status = $3,
        last_event_at = case when $3 in ('paused', 'archived') then last_event_at else last_event_at end,
        metadata_json = metadata_json || $4::jsonb
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.connectionId,
      parsed.data.status,
      JSON.stringify({
        manuallyReviewedAt: new Date().toISOString(),
        lifecycleAction: parsed.data.status === "paused"
          ? "disconnected"
          : parsed.data.status === "archived"
            ? "archived"
            : "status_updated"
      })
    ]
  );

  revalidatePath("/app/lifeops-connections");
  revalidatePath("/app/owner-command-center");
}

export async function createLifeOpsConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = createSchema.safeParse({
    platformKey: formData.get("platformKey"),
    platformName: formData.get("platformName"),
    platformType: formData.get("platformType"),
    ownerLayer: formData.get("ownerLayer") || "owner_command",
    externalBaseUrl: formData.get("externalBaseUrl") || "",
    eventScope: formData.get("eventScope") || "",
    notes: formData.get("notes") || ""
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const eventScope = (parsed.data.eventScope ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);

  await queryPostgres(
    `
    insert into public.owner_platform_connections (
      tenant_id, platform_key, platform_name, platform_type, connection_status,
      owner_layer, event_scope, action_href, external_base_url, notes, metadata_json
    )
    values ($1, $2, $3, $4, 'planned', $5, $6, '/app/owner-command-center', nullif($7, ''), nullif($8, ''), $9::jsonb)
    on conflict (tenant_id, platform_key) do update
    set platform_name = excluded.platform_name,
        platform_type = excluded.platform_type,
        owner_layer = excluded.owner_layer,
        event_scope = excluded.event_scope,
        external_base_url = excluded.external_base_url,
        notes = excluded.notes,
        metadata_json = public.owner_platform_connections.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.platformKey,
      parsed.data.platformName,
      parsed.data.platformType,
      parsed.data.ownerLayer,
      eventScope,
      parsed.data.externalBaseUrl || null,
      parsed.data.notes || null,
      JSON.stringify({ createdFrom: "lifeops_connections_page", createdAt: new Date().toISOString() })
    ]
  );

  revalidatePath("/app/lifeops-connections");
  revalidatePath("/app/owner-command-center");
}
