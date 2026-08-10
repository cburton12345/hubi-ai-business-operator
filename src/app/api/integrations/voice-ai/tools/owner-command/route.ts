import { NextRequest, NextResponse } from "next/server";
import {
  processRetellOwnerCommandTool,
  retellOwnerCommandDependencies
} from "@/lib/phone/retell-owner-command";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processRetellOwnerCommandTool(
    rawBody,
    request.headers.get("x-retell-signature"),
    retellOwnerCommandDependencies
  );
  return NextResponse.json(result, { status: result.status === "blocked" ? 403 : 200 });
}
