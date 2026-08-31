import { NextResponse } from "next/server";
import { authenticateFacebookConnector, facebookHealthSchema } from "@/lib/growth/facebook-connector-protocol";
import { applyIdentityHealthEvent } from "@/lib/growth/identity-health";
import { queryPostgres } from "@/lib/db/postgres";

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
  const alertKey = `facebook-connector:${auth.identity_id}:health`;
  if (parsed.data.state === "ready") {
    await queryPostgres(`update public.operator_alerts set status='resolved',resolved_at=now(),updated_at=now()
      where tenant_id=$1 and alert_key=$2 and status='active'`, [auth.tenant_id, alertKey]);
  } else {
    const title = parsed.data.state === "verification_required" ? "Facebook needs account verification"
      : parsed.data.state === "restricted" ? "Facebook restricted connector activity"
      : "Facebook connector needs attention";
    await queryPostgres(`
      insert into public.operator_alerts
        (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
      values ($1,$2,'integration',$3,'active',$4,$5,'/app/growth',$6::jsonb)
      on conflict (tenant_id,alert_key) do update set severity=excluded.severity,status='active',title=excluded.title,
        summary=excluded.summary,metadata_json=public.operator_alerts.metadata_json || excluded.metadata_json,
        last_seen_at=now(),resolved_at=null,updated_at=now()
    `, [auth.tenant_id, alertKey, ["verification_required", "restricted"].includes(parsed.data.state) ? "high" : "medium",
      title, parsed.data.reason || "The Facebook browser connector reported an unhealthy state.",
      JSON.stringify({ identityId: auth.identity_id, connectorState: parsed.data.state, providerCode: parsed.data.providerCode ?? null })]);
  }
  return NextResponse.json({ ok: true, riskState: state, paused: parsed.data.state !== "ready" }, { headers: { "Cache-Control": "no-store" } });
}
