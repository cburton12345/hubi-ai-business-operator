import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";

async function checkSupabase() {
  const startedAt = Date.now();
  const result = await queryPostgres<{ ok: number }>("select 1 as ok");

  if (!result?.rows[0]?.ok) {
    return NextResponse.json(
      {
        ok: false,
        service: "ferocity",
        supabase: "unavailable",
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
      service: "ferocity",
      supabase: "ready",
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

export async function GET() {
  return checkSupabase();
}

export async function HEAD() {
  const response = await checkSupabase();
  return new Response(null, {
    status: response.status,
    headers: response.headers
  });
}
