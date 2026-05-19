import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

export type WorkspaceSettings = {
  workspaceId: string;
  name: string;
  displayName: string;
  timezone: string;
  defaultReportEmail: string;
  planKey: string;
  billingStatus: string;
  exportPolicy: string;
  onboardingChecklist: { key: string; label: string; done: boolean }[];
  usage: Record<string, unknown>;
};

const defaultChecklist = [
  { key: "profile", label: "Complete organization profile", done: false },
  { key: "brands", label: "Add brand services, service areas, offers, and keywords", done: false },
  { key: "forms", label: "Publish or share approved lead forms", done: false },
  { key: "users", label: "Invite operators and reviewers", done: false },
  { key: "ai", label: "Generate weekly AI marketing plan", done: false },
  { key: "review", label: "Review and export first content package", done: false }
];

export async function ensureWorkspaceSettings() {
  const workspace = await getCurrentWorkspace();
  await queryPostgres(
    `
    insert into public.workspace_settings (tenant_id, display_name, onboarding_checklist_json)
    values ($1, $2, $3::jsonb)
    on conflict (tenant_id) do nothing
    `,
    [workspace.id, workspace.name, JSON.stringify(defaultChecklist)]
  );
  return workspace;
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const workspace = await ensureWorkspaceSettings();
  const result = await queryPostgres<{
    display_name: string | null;
    timezone: string;
    default_report_email: string | null;
    plan_key: string;
    billing_status: string;
    export_policy: string;
    onboarding_checklist_json: { key: string; label: string; done: boolean }[] | null;
    usage_json: Record<string, unknown> | null;
  }>(
    `
    select display_name, timezone, default_report_email, plan_key, billing_status, export_policy, onboarding_checklist_json, usage_json
    from public.workspace_settings
    where tenant_id = $1
    limit 1
    `,
    [workspace.id]
  );
  const row = result?.rows[0];

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    displayName: row?.display_name ?? workspace.name,
    timezone: row?.timezone ?? "America/Los_Angeles",
    defaultReportEmail: row?.default_report_email ?? "",
    planKey: row?.plan_key ?? "starter",
    billingStatus: row?.billing_status ?? "not_connected",
    exportPolicy: row?.export_policy ?? "manual_only",
    onboardingChecklist: row?.onboarding_checklist_json ?? defaultChecklist,
    usage: row?.usage_json ?? {}
  };
}
