import { NextRequest, NextResponse } from "next/server";
import {
  processRetellSalesCallbackTool,
  retellSalesCallbackDependencies
} from "@/lib/phone/retell-sales-callback";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processRetellSalesCallbackTool(
    rawBody,
    request.headers.get("x-retell-signature"),
    retellSalesCallbackDependencies
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
