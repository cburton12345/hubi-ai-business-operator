import { NextRequest, NextResponse } from "next/server";
import { createPublicBotChallenge } from "@/lib/security/public-bot-challenge";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimit = await consumePublicRateLimit({
    request,
    scope: "public-bot-challenge",
    limit: 20,
    windowSeconds: 60
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many challenge requests." }, { status: 429 });
  }

  try {
    const challenge = await createPublicBotChallenge(request.nextUrl.searchParams.get("action") ?? "");
    return NextResponse.json(challenge, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch {
    return NextResponse.json({ error: "Challenge is unavailable." }, { status: 503 });
  }
}
