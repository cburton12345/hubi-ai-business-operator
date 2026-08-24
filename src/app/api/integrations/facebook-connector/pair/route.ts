import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exchangeFacebookPairingCode, readConnectorBearer } from "@/lib/growth/facebook-connector-protocol";
import { revokeGrowthConnectorSession } from "@/lib/growth/connector-session";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  code: z.string().trim().min(12).max(20),
  deviceId: z.string().trim().min(16).max(200),
  connectorVersion: z.string().trim().min(1).max(50)
});

export async function POST(request: NextRequest) {
  const limit = await consumePublicRateLimit({ request, scope: "facebook-connector-pair", limit: 10, windowSeconds: 15 * 60 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "Too many pairing attempts." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid pairing request." }, { status: 400 });
  const session = await exchangeFacebookPairingCode(parsed.data);
  if (!session) return NextResponse.json({ ok: false, error: "Pairing code is invalid or expired." }, { status: 401 });
  return NextResponse.json({ ok: true, ...session }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const credentials = readConnectorBearer(request);
  if (!credentials) return NextResponse.json({ ok: false, error: "Connector session is missing." }, { status: 401 });
  await revokeGrowthConnectorSession(credentials);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
