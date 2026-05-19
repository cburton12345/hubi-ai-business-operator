import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OperationalQaRun = {
  id: string;
  status: string;
  summary: string;
  checks: { key: string; label: string; passed: boolean; detail: string }[];
  createdAt: string;
};

export async function getOperationalQaRuns(): Promise<OperationalQaRun[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    status: string;
    summary: string | null;
    checks_json: { key: string; label: string; passed: boolean; detail: string }[] | null;
    created_at: Date;
  }>(
    `
    select id, status, summary, checks_json, created_at
    from public.operational_qa_runs
    where tenant_id = $1
    order by created_at desc
    limit 10
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    summary: row.summary ?? "",
    checks: row.checks_json ?? [],
    createdAt: row.created_at.toISOString()
  }));
}
