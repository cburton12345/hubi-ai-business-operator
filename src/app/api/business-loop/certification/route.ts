import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  getGoldenLoopReadiness,
  setGoldenLoopPause,
  startGoldenLoopCertification
} from "@/lib/business-loop/business-loop-control";
import { syncGoldenBusinessLoopsForTenant } from "@/lib/business-loop/sync-golden-loop";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), leadId: z.string().uuid() }),
  z.object({ action: z.literal("pause"), runId: z.string().uuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("resume"), runId: z.string().uuid() }),
  z.object({ action: z.literal("evaluate") })
]);

export async function GET() {
  const actor = await requirePermission("tenant:view");
  const readiness = await getGoldenLoopReadiness(actor.workspace.id);
  return NextResponse.json({ ok: true, readiness }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await requirePermission("tenant:manage");
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid certification request." }, { status: 400 });
  }

  if (parsed.data.action === "start") {
    const runId = await startGoldenLoopCertification({ tenantId: actor.workspace.id, leadId: parsed.data.leadId });
    if (!runId) return NextResponse.json({ ok: false, message: "A matching non-spam lead was not found." }, { status: 404 });
    await syncGoldenBusinessLoopsForTenant(actor.workspace.id);
    return NextResponse.json({ ok: true, runId, liveActionsTriggered: false });
  }

  if (parsed.data.action === "pause" || parsed.data.action === "resume") {
    const run = await setGoldenLoopPause({
      tenantId: actor.workspace.id,
      runId: parsed.data.runId,
      paused: parsed.data.action === "pause",
      reason: parsed.data.action === "pause" ? parsed.data.reason : undefined
    });
    if (!run) return NextResponse.json({ ok: false, message: "The loop could not be updated." }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  }

  const sync = await syncGoldenBusinessLoopsForTenant(actor.workspace.id);
  const readiness = await getGoldenLoopReadiness(actor.workspace.id);
  return NextResponse.json({ ok: true, sync, readiness, liveActionsTriggered: false });
}
