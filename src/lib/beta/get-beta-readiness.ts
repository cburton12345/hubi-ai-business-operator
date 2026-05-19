import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type BetaReadiness = {
  checks: {
    id: string;
    key: string;
    label: string;
    status: string;
    notes: string;
  }[];
  counts: {
    brands: number;
    forms: number;
    users: number;
    aiPlans: number;
    exports: number;
    leads: number;
  };
};

const defaultChecks = [
  ["workspace-created", "External organization workspace exists"],
  ["brand-complete", "Primary brand profile has services, areas, offers, keywords, and form"],
  ["workspace-user-login", "Workspace user account created and login verified"],
  ["permission-qa", "Owner/admin/operator/viewer permissions verified"],
  ["weekly-ai-plan", "Weekly AI marketing plan generated and reviewed"],
  ["lead-ops", "Lead scoring, assignment, duplicate review, and CSV export verified"],
  ["safety-runbook", "Backup, rollback, and secret rotation runbook reviewed"]
] as const;

export async function ensureBetaChecks() {
  const workspaceId = await getCurrentWorkspaceId();
  for (const [key, label] of defaultChecks) {
    await queryPostgres(
      `
      insert into public.beta_launch_checks (tenant_id, check_key, label, status)
      values ($1, $2, $3, 'pending')
      on conflict (tenant_id, check_key) do nothing
      `,
      [workspaceId, key, label]
    );
  }
}

export async function getBetaReadiness(): Promise<BetaReadiness> {
  await ensureBetaChecks();
  const workspaceId = await getCurrentWorkspaceId();
  const [checks, counts] = await Promise.all([
    queryPostgres<{ id: string; check_key: string; label: string; status: string; notes: string | null }>(
      "select id, check_key, label, status, notes from public.beta_launch_checks where tenant_id = $1 order by created_at",
      [workspaceId]
    ),
    queryPostgres<{ brands: string; forms: string; users: string; ai_plans: string; exports: string; leads: string }>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status <> 'archived') as brands,
        (select count(*) from public.forms where tenant_id = $1 and active = true) as forms,
        (select count(*) from public.tenant_users where tenant_id = $1 and status = 'active') as users,
        (select count(*) from public.marketing_plans where tenant_id = $1) as ai_plans,
        (select count(*) from public.content_exports where tenant_id = $1) as exports,
        (select count(*) from public.leads where tenant_id = $1) as leads
      `,
      [workspaceId]
    )
  ]);

  const row = counts?.rows[0];
  return {
    checks: (checks?.rows ?? []).map((check) => ({
      id: check.id,
      key: check.check_key,
      label: check.label,
      status: check.status,
      notes: check.notes ?? ""
    })),
    counts: {
      brands: Number(row?.brands ?? 0),
      forms: Number(row?.forms ?? 0),
      users: Number(row?.users ?? 0),
      aiPlans: Number(row?.ai_plans ?? 0),
      exports: Number(row?.exports ?? 0),
      leads: Number(row?.leads ?? 0)
    }
  };
}
