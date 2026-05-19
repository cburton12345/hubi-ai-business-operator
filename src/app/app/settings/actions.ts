"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const settingsSchema = z.object({
  displayName: z.string().min(1).max(180),
  timezone: z.string().min(1).max(80),
  defaultReportEmail: z.union([z.string().email(), z.literal("")]),
  planKey: z.string().min(1).max(80),
  exportPolicy: z.enum(["manual_only", "approved_exports_only"])
});

export async function updateWorkspaceSettingsAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = settingsSchema.safeParse({
    displayName: formData.get("displayName"),
    timezone: formData.get("timezone"),
    defaultReportEmail: formData.get("defaultReportEmail") ?? "",
    planKey: formData.get("planKey"),
    exportPolicy: formData.get("exportPolicy")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.workspace_settings (tenant_id, display_name, timezone, default_report_email, plan_key, export_policy, updated_at)
    values ($1, $2, $3, $4, $5, $6, now())
    on conflict (tenant_id) do update
    set display_name = excluded.display_name,
        timezone = excluded.timezone,
        default_report_email = excluded.default_report_email,
        plan_key = excluded.plan_key,
        export_policy = excluded.export_policy,
        updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.displayName,
      parsed.data.timezone,
      parsed.data.defaultReportEmail || null,
      parsed.data.planKey,
      parsed.data.exportPolicy
    ]
  );
  revalidatePath("/app/settings");
}

export async function updateChecklistAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const items = String(formData.get("items") ?? "");
  const checklist = items
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const done = line.startsWith("[x]");
      return {
        key: line.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
        label: line.replace(/^\[[ x]\]\s*/i, ""),
        done
      };
    });

  await queryPostgres("update public.workspace_settings set onboarding_checklist_json = $2::jsonb, updated_at = now() where tenant_id = $1", [
    workspaceId,
    JSON.stringify(checklist)
  ]);
  revalidatePath("/app/settings");
}
