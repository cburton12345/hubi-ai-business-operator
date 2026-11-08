import { NextResponse, type NextRequest } from "next/server";
import { receiveMarketplaceProLegacyDelivery } from "@/lib/integrations/marketplacepro-legacy-runtime";

export async function POST(request: NextRequest) {
  const result = await receiveMarketplaceProLegacyDelivery(request, "event");
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "legacy_compatibility_uncertified",
    message: "Legacy shared-token compatibility requires a mandatory, exact, unambiguous MarketplacePro account mapping. Use the parallel v1 path for the staged owner pilot."
  });
}
