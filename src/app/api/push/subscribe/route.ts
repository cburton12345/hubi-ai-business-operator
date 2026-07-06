import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(20),
    auth: z.string().min(8)
  }),
  expirationTime: z.number().nullable().optional()
});

async function getPushActor() {
  const [session, admin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!session && !admin) return null;
  const workspace = await getCurrentWorkspace();
  return { session, workspace, admin };
}

export async function POST(request: NextRequest) {
  const actor = await getPushActor();
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Sign in before enabling push notifications." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid push subscription." }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.push_subscriptions (
      tenant_id, user_id, endpoint, p256dh_key, auth_key, permission, status, user_agent, metadata_json, last_seen_at
    )
    values ($1, $2, $3, $4, $5, 'granted', 'active', $6, $7::jsonb, now())
    on conflict (endpoint) do update
    set tenant_id = excluded.tenant_id,
        user_id = excluded.user_id,
        p256dh_key = excluded.p256dh_key,
        auth_key = excluded.auth_key,
        permission = 'granted',
        status = 'active',
        user_agent = excluded.user_agent,
        metadata_json = public.push_subscriptions.metadata_json || excluded.metadata_json,
        last_seen_at = now(),
        last_error = null
    returning id
    `,
    [
      actor.workspace.id,
      actor.session?.userId ?? null,
      parsed.data.endpoint,
      parsed.data.keys.p256dh,
      parsed.data.keys.auth,
      userAgent,
      JSON.stringify({
        createdFrom: "ferocity_app",
        actor: actor.session?.email ?? "admin-token",
        expirationTime: parsed.data.expirationTime ?? null
      })
    ]
  );

  return NextResponse.json({
    ok: Boolean(result?.rows[0]?.id),
    subscriptionId: result?.rows[0]?.id ?? null,
    workspaceId: actor.workspace.id
  });
}

export async function DELETE(request: NextRequest) {
  const actor = await getPushActor();
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Sign in before changing push notifications." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Missing subscription endpoint." }, { status: 400 });
  }

  await queryPostgres(
    `
    update public.push_subscriptions
    set status = 'revoked',
        permission = 'denied',
        last_seen_at = now()
    where endpoint = $1
      and (tenant_id = $2 or user_id = $3 or $4 = true)
    `,
    [parsed.data.endpoint, actor.workspace.id, actor.session?.userId ?? null, actor.admin]
  );

  return NextResponse.json({ ok: true });
}
