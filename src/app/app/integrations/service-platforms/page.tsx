import Link from "next/link";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { servicePlatformProviders } from "@/lib/integrations/service-platform-bridge";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { configureNativeServicePlatformConnectionAction, createServicePlatformBridgeAction, setExternalCallLogHandoffAction, syncJobberReadModelAction } from "./actions";

const platforms = [
  { key: "jobber", name: "Jobber", mode: "Native read-only OAuth; signed bridge remains available", body: "Let Ferocity analyze customers, requests, quotes, jobs, and invoices while Jobber remains the operational record." },
  { key: "highlevel", name: "HighLevel", mode: "Native call notes with a location token; signed bridge also available", body: "Bring contacts, opportunities/leads, and appointments represented as jobs into Ferocity without duplicating both automation engines." },
  { key: "housecall_pro", name: "Housecall Pro", mode: "Partner-gated; signed bridge works now", body: "Use a MAX webhook, Zapier, Make, or another approved middleware path until Housecall Pro grants multi-customer partner OAuth." },
  { key: "hubspot", name: "HubSpot", mode: "Native call engagements with a private-app or OAuth token", body: "Keep Ferocity calls on the matched HubSpot contact timeline while Ferocity retains the complete operational record." },
  { key: "servicetitan", name: "ServiceTitan", mode: "Enterprise access; signed bridge available now", body: "Keep Ferocity independent while an approved middleware bridge carries selected customer, lead, job, and call events into an existing ServiceTitan operation." }
] as const;

export default async function ServicePlatformsPage({ searchParams }: { searchParams: Promise<{ endpoint?: string; token?: string }> }) {
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const [rows, connectionResult, recordResult, callLogResult, nativeCredentialResult] = await Promise.all([
    queryPostgres<{ id: string; provider_key: string; url: string; status: string; last_received_at: string | null }>(
      "select id,provider_key,url,status,last_received_at from public.webhook_endpoints where tenant_id=$1 and connection_mode='middleware_bridge' order by created_at desc", [tenantId]
    ),
    queryPostgres<{ provider: string; status: string; metadata_json: { lastReadSyncAt?: string; writeBackEnabled?: boolean } | null }>(
      "select provider,status,metadata_json from public.integration_connections where tenant_id=$1 and provider='jobber' limit 1", [tenantId]
    ),
    queryPostgres<{ object_type: string; count: string }>(
      "select object_type,count(*)::text as count from public.external_service_platform_records where tenant_id=$1 and provider_key='jobber' and provider_deleted_at is null group by object_type order by object_type", [tenantId]
    ),
    queryPostgres<{ provider: string; connection_status: string; credentials_status: string; enabled: boolean; handoff_status: string | null; credential_ready: boolean; bridge_ready: boolean; delivery_mode: string | null }>(
      `select c.provider,c.status as connection_status,c.credentials_status,
        coalesce(s.enabled,false) as enabled,s.status as handoff_status,s.delivery_mode,
        exists (select 1 from public.tenant_provider_credentials v
          where v.tenant_id=c.tenant_id and v.provider_key=c.provider and v.status='configured'
            and lower(regexp_replace(v.credential_label,'[^a-z0-9]+','_','g')) in
              ('oauth_access_token','private_integration_token','private_app_token','access_token','auth_token','service_key','api_key')) as credential_ready,
        (select count(distinct lower(regexp_replace(v.credential_label,'[^a-z0-9]+','_','g')))=2
          from public.tenant_provider_credentials v
          where v.tenant_id=c.tenant_id and v.provider_key=c.provider and v.status='configured'
            and lower(regexp_replace(v.credential_label,'[^a-z0-9]+','_','g')) in
              ('call_log_webhook_url','call_log_webhook_secret')) as bridge_ready
       from public.integration_connections c
       left join public.external_call_log_settings s on s.connection_id=c.id and s.tenant_id=c.tenant_id
       where c.tenant_id=$1 and c.provider=any($2::text[])
       order by c.provider`,
      [tenantId, [...servicePlatformProviders]]
    ),
    queryPostgres<{ provider_key: string }>(
      `select distinct provider_key
       from public.tenant_provider_credentials
       where tenant_id=$1 and provider_key=any($2::text[]) and status='configured'
         and lower(regexp_replace(credential_label,'[^a-z0-9]+','_','g')) in
           ('oauth_access_token','private_integration_token','private_app_token','access_token','auth_token','service_key','api_key')`,
      [tenantId, ["highlevel", "hubspot"]]
    )
  ]);
  const created = params.endpoint ? rows?.rows.find((row) => row.id === params.endpoint) : null;
  const jobberConnection = connectionResult?.rows[0] ?? null;
  return <QueuePageShell eyebrow="Keep the tools you prefer" title="Connect an existing service platform" description="Ferocity can sit above an incumbent CRM during adoption. Provider-owned records stay mapped to their source; Ferocity adds intelligence, follow-up, growth, owner visibility, and guarded execution.">
    <div className="button-row"><Link className="button secondary-button" href="/app/integrations">All integrations</Link><Link className="button secondary-button" href="/app/exports">Import a CSV instead</Link></div>
    {created && params.token ? <section className="panel form-stack"><h2>Copy this connection once</h2><p className="muted">Paste the URL and bearer token into Zapier, Make, or the provider webhook step. Ferocity stores only a hash and cannot show the token again.</p><label>Webhook URL<input readOnly value={created.url} /></label><label>Bearer token<input readOnly value={params.token} /></label></section> : null}
    <section className="grid">{platforms.map((platform) => {
      const active = rows?.rows.find((row) => row.provider_key === platform.key && row.status === "active");
      const nativeJobber = platform.key === "jobber" && jobberConnection?.status === "connected";
      const connection = callLogResult?.rows.find((row) => row.provider === platform.key);
      const tokenCapable = ["highlevel", "hubspot"].includes(platform.key);
      const tokenReady = nativeCredentialResult?.rows.some((row) => row.provider_key === platform.key) === true;
      const tokenConnected = tokenCapable && connection?.connection_status === "connected" && connection?.credentials_status === "configured";
      return <article className="panel span-4 form-stack" key={platform.key}><div className="list-row flush-row"><h2><ArrowRightLeft size={18} /> {platform.name}</h2><span className="pill">{nativeJobber ? "Connected read-only" : tokenConnected ? "Token connection ready" : active ? "Bridge ready" : "Available"}</span></div><p>{platform.body}</p><p className="muted">{platform.mode}</p>{platform.key === "jobber" ? nativeJobber ? <><form action={syncJobberReadModelAction}><button className="button" type="submit">Refresh Jobber analysis</button></form><p className="muted">Last read: {jobberConnection.metadata_json?.lastReadSyncAt || "Ready for first sync"}</p><p className="muted">Write-back: Off</p></> : <Link className="button" href="/api/integrations/jobber/oauth/start">Connect Jobber</Link> : null}{tokenCapable && !tokenConnected ? tokenReady ? <form action={configureNativeServicePlatformConnectionAction}><input name="providerKey" type="hidden" value={platform.key} /><button className="button" type="submit">Use saved token</button></form> : <Link className="button" href="/app/credentials">Add provider token</Link> : null}{active ? <><code>{active.url}</code><p className="muted">Last update: {active.last_received_at || "Waiting for first event"}</p></> : <form action={createServicePlatformBridgeAction}><input name="providerKey" type="hidden" value={platform.key} /><button className="button secondary-button" type="submit">{platform.key === "jobber" ? "Use bridge instead" : "Create secure bridge"}</button></form>}<p className="muted"><ShieldCheck size={14} /> Incoming deletes detach the mapping; Ferocity does not erase customer history.</p></article>;
    })}</section>
    <section className="panel section-actions">
      <div>
        <p className="eyebrow">Optional call history handoff</p>
        <h2>Keep Ferocity calls visible in the service platform your team already opens.</h2>
        <p className="muted">Ferocity keeps the complete call, transcript, recording, outcome, and retry history. A connected platform receives only the approved concise summary and Ferocity link. Provider failure never blocks or removes the call.</p>
      </div>
      <div className="stacked-list">
        {platforms.map((platform) => {
          const handoff = callLogResult?.rows.find((row) => row.provider === platform.key);
          const nativeReady = ["highlevel", "hubspot"].includes(platform.key) && handoff?.connection_status === "connected" && handoff.credential_ready;
          const bridgeReady = handoff?.connection_status === "connected" && handoff.bridge_ready;
          const ready = nativeReady || bridgeReady;
          const enabled = handoff?.enabled === true && handoff.handoff_status === "ready";
          return <div className="list-row flush-row" key={`call-log-${platform.key}`}>
            <div>
              <strong>{platform.name}</strong>
              <p className="muted">{enabled
                ? `Call summaries are queued through ${handoff?.delivery_mode === "native_api" ? "the native contact-note adapter" : "your signed bridge"}.`
                : ready
                  ? `Ready for the owner to enable ${nativeReady ? platform.key === "hubspot" ? "as a native HubSpot call" : "as a native contact note" : "through the signed bridge"}.`
                  : ["highlevel", "hubspot"].includes(platform.key)
                    ? "Add the provider token, or configure a signed bridge."
                    : "Create the provider bridge, then add its outbound URL and signing secret."}</p>
            </div>
            {enabled ? <form action={setExternalCallLogHandoffAction}><input name="providerKey" type="hidden" value={platform.key} /><input name="enabled" type="hidden" value="false" /><button className="button secondary-button" type="submit">Turn off</button></form>
              : ready ? <form action={setExternalCallLogHandoffAction}><input name="providerKey" type="hidden" value={platform.key} /><input name="enabled" type="hidden" value="true" /><button className="button" type="submit">Enable call handoff</button></form>
              : <Link className="button secondary-button" href="/app/credentials">Add credentials</Link>}
          </div>;
        })}
      </div>
    </section>
    {recordResult?.rows.length ? <section className="panel"><h2>Jobber business view</h2><p className="muted">Provider-owned summaries available to Ferocity analysis.</p><div className="button-row">{recordResult.rows.map((row) => <span className="pill" key={row.object_type}>{row.object_type}: {row.count}</span>)}</div></section> : null}
    <section className="panel"><h2>Supported bridge events</h2><p>Contact, lead, and job upserts use external IDs for safe retries. Ferocity deduplicates customers by mapping, email, or phone and never turns on outbound writes automatically.</p></section>
  </QueuePageShell>;
}
