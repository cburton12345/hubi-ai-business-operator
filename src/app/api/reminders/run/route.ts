import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sendDueOwnerReminders } from "@/lib/reminders/owner-reminders";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function authorized(request: NextRequest) {
  const token = bearerToken(request) ?? request.nextUrl.searchParams.get("token");
  return Boolean(env.AI_WORKFORCE_CRON_TOKEN && token && token === env.AI_WORKFORCE_CRON_TOKEN);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized reminder runner." }, { status: 401 });
  }

  const result = await sendDueOwnerReminders(75);
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
