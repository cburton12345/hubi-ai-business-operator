import { NextRequest, NextResponse } from "next/server";
import { processRetellBusinessTool } from "@/lib/phone/retell-business-tools";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processRetellBusinessTool(rawBody, request.headers.get("x-retell-signature"));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
