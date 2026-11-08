import { NextResponse, type NextRequest } from "next/server";
import { receiveMarketplaceProHttpDelivery } from "@/lib/integrations/marketplacepro-delivery-runtime";

export async function POST(request: NextRequest) {
  const result = await receiveMarketplaceProHttpDelivery(request, "event");
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "owner_pilot_disabled_by_default",
    contractVersion: "2026-10-22.v1",
    message: "This staged receiver requires explicit server-side enrollment, exact source-account mapping, and a connection-bound signing credential.",
  });
}
