import { NextResponse } from "next/server";
import { authenticateFacebookConnector, facebookHealthSchema } from "@/lib/growth/facebook-connector-protocol";
import { applyIdentityHealthEvent } from "@/lib/growth/identity-health";

const healthEvent = {
  ready: "success", warning: "transient_failure", verification_required: "verification_required",
  restricted: "restricted", connector_incompatible: "connector_incompatible"
} as const;

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:health");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });
  const parsed = facebookHealthSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid health report." }, { status: 400 });
  const state = await applyIdentityHealthEvent({
    tenantId: auth.tenant_id, identityId: auth.identity_id, event: healthEvent[parsed.data.state],
    reason: parsed.data.reason, providerCode: parsed.data.providerCode,
    idempotencyKey: `facebook-health:${auth.identity_id}:${parsed.data.state}:${Date.now()}`,
    rawEvent: { url: parsed.data.url, connectorVersion: parsed.data.connectorVersion }
  });
  return NextResponse.json({ ok: true, riskState: state, paused: parsed.data.state !== "ready" }, { headers: { "Cache-Control": "no-store" } });
}
