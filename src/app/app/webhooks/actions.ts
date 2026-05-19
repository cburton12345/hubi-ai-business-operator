"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({
  name: z.string().min(1).max(160),
  url: z.string().url(),
  eventTypes: z.string().min(1)
});

export async function createWebhookEndpointAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    eventTypes: formData.get("eventTypes")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const eventTypes = parsed.data.eventTypes.split(",").map((item) => item.trim()).filter(Boolean);
  await queryPostgres(
    `
    insert into public.webhook_endpoints (tenant_id, name, url, event_types_json, status, signing_secret_hint)
    values ($1, $2, $3, $4::jsonb, 'paused', 'configure-secret-later')
    `,
    [workspaceId, parsed.data.name, parsed.data.url, JSON.stringify(eventTypes)]
  );
  revalidatePath("/app/webhooks");
}
