import { NextResponse } from "next/server";
import { authenticateFacebookConnector, facebookObservationSchema } from "@/lib/growth/facebook-connector-protocol";
import { ingestGrowthEngagement } from "@/lib/growth/ingest-growth-engagement";

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:observe");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });
  const parsed = facebookObservationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid observation." }, { status: 400 });
  const result = await ingestGrowthEngagement({
    tenantId: auth.tenant_id, brandId: auth.brand_id, identityId: auth.identity_id, channelKey: "facebook",
    providerEventId: parsed.data.providerEventId, externalConversationRef: parsed.data.externalConversationRef,
    externalActorId: parsed.data.externalActorId, displayName: parsed.data.displayName, profileUrl: parsed.data.profileUrl,
    body: parsed.data.body, sourceUrl: parsed.data.sourceUrl, strategyVersion: "facebook-assisted-v1",
    rawEvent: { surface: parsed.data.surface, connectorVersion: parsed.data.connectorVersion, observedAt: parsed.data.observedAt }
  });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
