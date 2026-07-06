import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runBusinessAutomationLoop } from "@/lib/automation/run-business-automation";

export const dynamic = "force-dynamic";

function tokenFrom(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-ferocity-automation-token") ?? request.nextUrl.searchParams.get("token") ?? "";
}

function intParam(request: NextRequest, key: string, fallback: number) {
  const value = Number(request.nextUrl.searchParams.get(key) ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), 250));
}

export async function POST(request: NextRequest) {
  if (!env.AI_WORKFORCE_CRON_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        message: "AI_WORKFORCE_CRON_TOKEN is not configured, so the business automation runner is disabled."
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (tokenFrom(request) !== env.AI_WORKFORCE_CRON_TOKEN) {
    return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const result = await runBusinessAutomationLoop({
    tenantId,
    tenantLimit: intParam(request, "tenantLimit", 100),
    agentLimit: intParam(request, "agentLimit", 25)
  });

  return NextResponse.json(
    {
      ...result,
      liveActionsStillGated: true
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
