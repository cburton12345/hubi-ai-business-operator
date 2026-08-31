import { NextResponse } from "next/server";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { claimNextConnectJob } from "@/lib/ferocity-connect/queue";

export async function GET(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const job = await claimNextConnectJob(auth.identity);
  return NextResponse.json({ ok: true, job }, { headers: { "Cache-Control": "no-store" } });
}
