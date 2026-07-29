import { queryPostgres } from "@/lib/db/postgres";

export type AiCommandRoute = {
  label: string;
  href: string;
  reason?: string;
};

export type AiCommandRun = {
  id: string;
  command: string;
  status: "prepared" | "needs_attention" | "failed";
  prepared: string[];
  blocked: string[];
  missingInfo: string[];
  routes: AiCommandRoute[];
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type RunRow = {
  id: string;
  command: string;
  status: "prepared" | "needs_attention" | "failed";
  prepared_json: unknown;
  blocked_json: unknown;
  missing_info_json: unknown;
  routes_json: unknown;
  metadata_json: Record<string, unknown> | null;
  created_at: Date;
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function routes(value: unknown): AiCommandRoute[] {
  if (!Array.isArray(value)) return [];
  const parsed: AiCommandRoute[] = [];
  for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const label = String(record.label ?? "").trim();
      const href = String(record.href ?? "").trim();
      if (!label || !href.startsWith("/")) continue;
      parsed.push({
        label,
        href,
        reason: typeof record.reason === "string" ? record.reason : undefined
      });
  }
  return parsed;
}

function mapRun(row: RunRow): AiCommandRun {
  return {
    id: row.id,
    command: row.command,
    status: row.status,
    prepared: stringList(row.prepared_json),
    blocked: stringList(row.blocked_json),
    missingInfo: stringList(row.missing_info_json),
    routes: routes(row.routes_json),
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at
  };
}

export async function getAiCommandRun(workspaceId: string, runId: string) {
  const result = await queryPostgres<RunRow>(
    `
    select id, command, status, prepared_json, blocked_json, missing_info_json, routes_json, metadata_json, created_at
    from public.ai_command_runs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, runId]
  );
  const row = result?.rows[0];
  return row ? mapRun(row) : null;
}

export async function getLatestAiCommandRun(workspaceId: string) {
  const result = await queryPostgres<RunRow>(
    `
    select id, command, status, prepared_json, blocked_json, missing_info_json, routes_json, metadata_json, created_at
    from public.ai_command_runs
    where tenant_id = $1
    order by created_at desc
    limit 1
    `,
    [workspaceId]
  );
  const row = result?.rows[0];
  return row ? mapRun(row) : null;
}

export async function getRecentAiCommandRuns(workspaceId: string, limit = 8) {
  const result = await queryPostgres<RunRow>(
    `
    select id, command, status, prepared_json, blocked_json, missing_info_json, routes_json, metadata_json, created_at
    from public.ai_command_runs
    where tenant_id = $1
    order by created_at desc
    limit $2
    `,
    [workspaceId, limit]
  );
  return (result?.rows ?? []).map(mapRun);
}
