import { NextResponse } from "next/server";
import { buildListingSyndicationXml, getListingSyndicationFeed, isListingSyndicationProvider } from "@/lib/growth/listing-syndication";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ tenantId: string; provider: string }> }
) {
  const { tenantId, provider } = await context.params;
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !isListingSyndicationProvider(provider)) {
    return NextResponse.json({ ok: false, error: "Invalid tenant or provider." }, { status: 400 });
  }
  if (!token) return NextResponse.json({ ok: false, error: "Missing feed token." }, { status: 401 });
  const feed = await getListingSyndicationFeed({ tenantId, providerKey: provider, token });
  if (!feed) return NextResponse.json({ ok: false, error: "Invalid or inactive feed token." }, { status: 403 });
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase();
  const payload = {
    ok: true,
    tenant_id: tenantId,
    provider,
    generated_at: new Date().toISOString(),
    publish_allowed: feed.publishAllowed,
    provider_approval_required: !feed.providerApproved,
    included_count: feed.included.length,
    skipped_count: feed.skipped.length,
    skipped: feed.skipped,
    listings: feed.included
  };
  if (format === "json" || provider === "tenantcloud" || provider === "turbotenant") {
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }
  return new Response(buildListingSyndicationXml({ tenantId, providerKey: provider, listings: feed.included, skippedCount: feed.skipped.length }), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" }
  });
}
