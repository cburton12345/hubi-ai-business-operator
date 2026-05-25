import { NextResponse } from "next/server";
import {
  marketplaceProAuthState,
  marketplaceProStatusSchema,
  updateMarketplaceProLeadStatus
} from "@/lib/integrations/marketplacepro";

export async function POST(request: Request) {
  const auth = marketplaceProAuthState(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = marketplaceProStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid MarketplacePro status payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateMarketplaceProLeadStatus(parsed.data);
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "stub_ready",
    message: "POST signed MarketplacePro status updates here. Outbound sync remains paused until rules are reviewed."
  });
}
