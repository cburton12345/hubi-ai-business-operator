import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { issueFacebookPairingCode } from "@/lib/growth/facebook-connector-protocol";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({ identityId: z.string().uuid(), enableControlledTest: z.literal(true) });

export async function POST(request: Request) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid Facebook identity." }, { status: 400 });
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const pairing = await issueFacebookPairingCode({ tenantId, identityId: parsed.data.identityId,
    issuedByUserId: session?.userId, enableControlledTest: parsed.data.enableControlledTest });
  if (!pairing) return NextResponse.json({ ok: false, error: "Facebook identity not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ...pairing }, { headers: { "Cache-Control": "no-store" } });
}
