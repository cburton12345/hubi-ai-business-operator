import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { issueConnectPairingToken } from "@/lib/ferocity-connect/pairing";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({ displayName: z.string().trim().min(1).max(80).optional() });

export async function POST(request: Request) {
  await requirePermission("tenant:manage");
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid device name." }, { status: 400 });
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const pairing = await issueConnectPairingToken({ tenantId, issuedByUserId: session?.userId, displayNameHint: parsed.data.displayName });
  if (!pairing) return NextResponse.json({ ok: false, error: "Device pairing is temporarily disabled." }, { status: 503 });
  return NextResponse.json({ ok: true, ...pairing }, { headers: { "Cache-Control": "no-store" } });
}
