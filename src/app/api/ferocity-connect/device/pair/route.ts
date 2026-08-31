import { NextResponse } from "next/server";
import { z } from "zod";
import { pairConnectDevice } from "@/lib/ferocity-connect/pairing";

const simSchema = z.object({
  subscriptionId: z.number().int(), slotIndex: z.number().int().nullable().optional(),
  carrierName: z.string().max(100).nullable().optional(), phoneNumber: z.string().max(32).nullable().optional(),
  countryIso: z.string().max(3).nullable().optional()
});
const schema = z.object({
  pairingToken: z.string().min(40).max(200), displayName: z.string().trim().min(1).max(80),
  installationFingerprint: z.string().min(16).max(300), appVersion: z.string().min(1).max(40),
  androidVersion: z.string().min(1).max(40), manufacturer: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(), sims: z.array(simSchema).max(4)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid pairing request." }, { status: 400 });
  let pairing;
  try {
    pairing = await pairConnectDevice(parsed.data);
  } catch (error) {
    if (error instanceof Error && error.message === "FEROCITY_CONNECT_DEVICE_LIMIT_REACHED") {
      return NextResponse.json({ ok: false, error: "This workspace has reached its paired-device allowance." }, { status: 409 });
    }
    throw error;
  }
  if (!pairing) return NextResponse.json({ ok: false, error: "Pairing token is invalid, expired, or already used." }, { status: 401 });
  return NextResponse.json({ ok: true, ...pairing }, { headers: { "Cache-Control": "no-store" } });
}
