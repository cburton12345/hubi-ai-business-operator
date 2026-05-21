"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  name: z.string().min(1).max(160),
  url: z.string().url(),
  direction: z.enum(["inbound", "outbound"]),
  eventTypes: z.string().min(1)
});

const statusSchema = z.object({
  endpointId: z.string().uuid(),
  status: z.enum(["active", "paused", "disabled"])
});

export async function createWebhookEndpointAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    direction: formData.get("direction"),
    eventTypes: formData.get("eventTypes")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const eventTypes = parsed.data.eventTypes.split(",").map((item) => item.trim()).filter(Boolean);
  const token = parsed.data.direction === "inbound" ? randomSessionToken() : null;
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.webhook_endpoints (
      tenant_id,
      name,
      url,
      direction,
      event_types_json,
      status,
      signing_secret_hint,
      inbound_token_hash
    )
    values ($1, $2, $3, $4, $5::jsonb, 'paused', $6, $7)
    returning id
    `,
    [
      workspaceId,
      parsed.data.name,
      parsed.data.url,
      parsed.data.direction,
      JSON.stringify(eventTypes),
      token ? "token-created-copy-now" : "configure-secret-later",
      token ? hashSessionToken(token) : null
    ]
  );
  revalidatePath("/app/webhooks");
  if (token && result?.rows[0]?.id) {
    redirect(`/app/webhooks?token=${encodeURIComponent(token)}&endpoint=${encodeURIComponent(result.rows[0].id)}`);
  }
}

export async function updateWebhookEndpointStatusAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = statusSchema.safeParse({
    endpointId: formData.get("endpointId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.webhook_endpoints
    set status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.endpointId, parsed.data.status]
  );
  revalidatePath("/app/webhooks");
}
