import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { cancelConnectScheduledText, ConnectScheduledTextError } from "@/lib/ferocity-connect/scheduled-texts";

const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const id = idSchema.safeParse((await context.params).messageId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid scheduled message." }, { status: 400 });
  try {
    await cancelConnectScheduledText({ tenantId: auth.identity.tenantId, deviceId: auth.identity.deviceId, id: id.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConnectScheduledTextError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
}
