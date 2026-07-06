import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

const testSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(180).optional(),
  url: z.string().startsWith("/").max(200).optional()
});

async function getActor() {
  const [session, admin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!session && !admin) return null;
  const workspace = await getCurrentWorkspace();
  return { session, admin, workspace };
}

export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Sign in before testing push notifications." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = testSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid test notification." }, { status: 400 });
  }

  const result = await sendWorkspacePushNotifications({
    tenantId: actor.workspace.id,
    recipientUserId: actor.session?.userId ?? null,
    eventType: "push.test",
    title: parsed.data.title ?? "Ferocity test",
    body: parsed.data.body ?? "Push notifications are working.",
    url: parsed.data.url ?? "/app/attention-command",
    tag: "ferocity-test",
    metadata: { source: "manual_test" },
    limit: 5
  });

  if (result.subscriptionCount === 0) {
    return NextResponse.json({ ok: false, message: "No active push subscription found for this workspace." }, { status: 404 });
  }

  if (result.skipped && result.missing.length > 0) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      message: `Push is wired but missing ${result.missing.join(", ")}.`,
      missing: result.missing
    });
  }

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    failed: result.failed,
    subscriptionCount: result.subscriptionCount
  });
}
