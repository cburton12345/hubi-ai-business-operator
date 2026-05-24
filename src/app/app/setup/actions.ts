"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const verticalSchema = z.object({
  verticalKey: z.string().min(1),
  status: z.enum(["not_started", "active", "paused", "not_needed"]),
  priority: z.enum(["low", "normal", "high"]),
  notes: z.string().optional()
});

const stepSchema = z.object({
  verticalKey: z.string().min(1),
  stepKey: z.string().min(1),
  status: z.enum(["not_started", "in_progress", "done", "blocked", "skipped"]),
  notes: z.string().optional()
});

export async function updateVerticalStatusAction(formData: FormData) {
  await requirePermission("tenant:view");
  const parsed = verticalSchema.safeParse({
    verticalKey: formData.get("verticalKey"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.workspace_vertical_status (tenant_id, vertical_key, status, priority, notes, updated_at)
    values ($1, $2, $3, $4, $5, now())
    on conflict (tenant_id, vertical_key) do update
    set status = excluded.status,
        priority = excluded.priority,
        notes = excluded.notes,
        updated_at = now()
    `,
    [workspaceId, parsed.data.verticalKey, parsed.data.status, parsed.data.priority, parsed.data.notes ?? ""]
  );
  revalidatePath("/app/setup");
}

export async function updateSetupStepStatusAction(formData: FormData) {
  await requirePermission("tenant:view");
  const parsed = stepSchema.safeParse({
    verticalKey: formData.get("verticalKey"),
    stepKey: formData.get("stepKey"),
    status: formData.get("status"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  await queryPostgres(
    `
    insert into public.workspace_step_status (tenant_id, vertical_key, step_key, status, notes, updated_by_user_id, updated_at)
    values ($1, $2, $3, $4, $5, $6, now())
    on conflict (tenant_id, vertical_key, step_key) do update
    set status = excluded.status,
        notes = excluded.notes,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
    `,
    [workspaceId, parsed.data.verticalKey, parsed.data.stepKey, parsed.data.status, parsed.data.notes ?? "", session?.userId ?? null]
  );
  revalidatePath("/app/setup");
}
