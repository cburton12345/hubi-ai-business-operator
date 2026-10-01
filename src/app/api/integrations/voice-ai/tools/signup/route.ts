import { NextRequest, NextResponse } from "next/server";
import { processRetellSignupInviteTool, retellSignupInviteDependencies } from "@/lib/phone/retell-signup-invite";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processRetellSignupInviteTool(
    rawBody,
    request.headers.get("x-retell-signature"),
    retellSignupInviteDependencies
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
