import { NextResponse } from "next/server";
import {
  marketplaceProAuthState,
  marketplaceProEventSchema,
  recordMarketplaceProEvent
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

  const parsed = marketplaceProEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid MarketplacePro event payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await recordMarketplaceProEvent(parsed.data);
  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "adapter_stub_ready",
    message: "POST signed MarketplacePro launch-table events here. Supported tables: posts, offers, labor_pool, saved_providers, worker_contact_requests, follows, notifications, support_requests."
  });
}
