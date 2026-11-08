import { NextResponse, type NextRequest } from "next/server";
import { receiveMarketplaceProHttpDelivery } from "@/lib/integrations/marketplacepro-delivery-runtime";

export async function POST(request: NextRequest) {
  const result = await receiveMarketplaceProHttpDelivery(request, "lead_status");
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "owner_pilot_disabled_by_default",
    contractVersion: "2026-10-22.v1",
    message: "This staged status receiver is HMAC-only and resolves updates inside the authenticated connection tenant.",
  });
}
