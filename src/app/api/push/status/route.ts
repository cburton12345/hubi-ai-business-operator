import { NextResponse } from "next/server";
import { getPushReadiness } from "@/lib/push/web-push";

export async function GET() {
  const readiness = getPushReadiness();
  return NextResponse.json({
    ready: readiness.ready,
    publicKey: readiness.publicKey,
    missing: readiness.missing
  });
}
