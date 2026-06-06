import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { runDueAgentWorkflows } from "@/lib/ai-workforce/agent-workflows";
import { fallbackWorkspaceId } from "@/lib/workspace/current-workspace";

export const dynamic = "force-dynamic";

function tokenFrom(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-ai-workforce-token") ?? request.nextUrl.searchParams.get("token") ?? "";
}

async function logMonitorRun(status: string, body: string, metadata: Record<string, unknown>) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'ai_workforce_monitor', $2, $3, $4::jsonb)
    `,
    [fallbackWorkspaceId, `AI Workforce monitor ${status}`, body, JSON.stringify(metadata)]
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  if (!env.AI_WORKFORCE_CRON_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        message: "AI_WORKFORCE_CRON_TOKEN is not configured, so background AI monitoring is disabled."
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (tokenFrom(request) !== env.AI_WORKFORCE_CRON_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        status: "unauthorized"
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await runDueAgentWorkflows({ limit: 25 });

  await logMonitorRun(
    "completed",
    "Protected AI Workforce monitor ran due AI agent workflows. Customer sends, publishing, ads, payments, and provider sync stayed behind existing gates.",
    {
      tenantsChecked: result.tenantsChecked,
      dueCount: result.dueCount,
      completed: result.completed,
      liveActionsStillGated: true,
      elapsedMs: Date.now() - startedAt
    }
  );

  return NextResponse.json(
    {
      ok: true,
      status: "completed",
      tenantsChecked: result.tenantsChecked,
      dueCount: result.dueCount,
      completed: result.completed,
      liveActionsStillGated: true,
      elapsedMs: Date.now() - startedAt
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
