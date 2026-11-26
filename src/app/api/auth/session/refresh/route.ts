import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appSessionCookieName } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { secondsUntil, sessionCookieOptions } from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

function requestIsSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(appSessionCookieName)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const result = await queryPostgres<{ expires_at: Date }>(
    `
    update public.app_sessions
    set last_seen_at = case
          when last_seen_at <= now() - interval '12 hours' then now()
          else last_seen_at
        end,
        renewed_at = case
          when expires_at <= now() + interval '30 days' then now()
          else renewed_at
        end,
        expires_at = case
          when expires_at <= now() + interval '30 days'
            then least(now() + interval '90 days', absolute_expires_at)
          else expires_at
        end
    where session_token_hash = $1
      and revoked_at is null
      and expires_at > now()
      and absolute_expires_at > now()
    returning expires_at
    `,
    [hashSessionToken(token)],
  );
  if (!result) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
  const row = result.rows[0];
  if (!row) {
    cookieStore.delete(appSessionCookieName);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const expiresAt = new Date(row.expires_at);
  cookieStore.set(appSessionCookieName, token, sessionCookieOptions(secondsUntil(expiresAt)));
  return NextResponse.json(
    { ok: true, expiresAt: expiresAt.toISOString() },
    { headers: { "cache-control": "no-store, private" } },
  );
}
