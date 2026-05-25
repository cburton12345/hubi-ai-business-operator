import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const result = await queryPostgres<{ ok: number; tenant_count: string }>(
    `
    select 1 as ok, count(*)::text as tenant_count
    from public.tenants
    `
  );

  if (!result?.rows[0]?.ok) {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        status: "unavailable",
        checkedAt: new Date().toISOString()
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      service: "supabase",
      status: "ready",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
