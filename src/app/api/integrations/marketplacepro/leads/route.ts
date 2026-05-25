import { NextResponse } from "next/server";
import {
  importMarketplaceProLead,
  marketplaceProAuthState,
  marketplaceProLeadSchema
} from "@/lib/integrations/marketplacepro";
import { logAppError } from "@/lib/observability/log-error";

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

  const parsed = marketplaceProLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid MarketplacePro lead payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await importMarketplaceProLead(parsed.data);
  if (!result.ok) {
    await logAppError({
      source: "api.integrations.marketplacepro.leads",
      message: result.error ?? "MarketplacePro lead import failed.",
      severity: "error",
      metadata: { marketplaceLeadId: parsed.data.marketplaceLeadId }
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "stub_ready",
    message: "POST signed MarketplacePro lead payloads here to import mapped vendor leads into Ferocity."
  });
}
