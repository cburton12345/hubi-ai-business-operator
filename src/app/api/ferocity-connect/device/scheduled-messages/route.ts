import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import {
  ConnectScheduledTextError,
  createConnectScheduledText,
  listConnectScheduledTexts
} from "@/lib/ferocity-connect/scheduled-texts";

const createSchema = z.object({
  recipient: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number such as +17155551234."),
  body: z.string().trim().min(1).max(1600),
  scheduledFor: z.coerce.date(),
  deviceTimeZone: z.string().trim().min(1).max(100)
});

function unavailable(identity: { deviceStatus: string; sendingEnabled: boolean }) {
  return !identity.sendingEnabled || !["paired", "active"].includes(identity.deviceStatus);
}

export async function GET(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const messages = await listConnectScheduledTexts(auth.identity.tenantId);
  return NextResponse.json({ ok: true, messages }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (unavailable(auth.identity)) {
    return NextResponse.json({ ok: false, error: "This device is paused or Connect sending is disabled." }, { status: 409 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the message details." }, { status: 400 });
  }
  try {
    const message = await createConnectScheduledText({
      tenantId: auth.identity.tenantId,
      deviceId: auth.identity.deviceId,
      ...parsed.data
    });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    if (error instanceof ConnectScheduledTextError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
}
