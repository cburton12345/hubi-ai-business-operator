import Link from "next/link";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { createServicePlatformBridgeAction, syncJobberReadModelAction } from "./actions";

const platforms = [
  { key: "jobber", name: "Jobber", mode: "Native read-only OAuth; signed bridge remains available", body: "Let Ferocity analyze customers, requests, quotes, jobs, and invoices while Jobber remains the operational record." },
  { key: "highlevel", name: "HighLevel", mode: "Native OAuth is next; signed bridge works now", body: "Bring contacts, opportunities/leads, and appointments represented as jobs into Ferocity without duplicating both automation engines." },
  { key: "housecall_pro", name: "Housecall Pro", mode: "Partner-gated; signed bridge works now", body: "Use a MAX webhook, Zapier, Make, or another approved middleware path until Housecall Pro grants multi-customer partner OAuth." }
] as const;

export default async function ServicePlatformsPage({ searchParams }: { searchParams: Promise<{ endpoint?: string; token?: string }> }) {
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const [rows, connectionResult, recordResult] = await Promise.all([
    queryPostgres<{ id: string; provider_key: string; url: string; status: string; last_received_at: string | null }>(
      "select id,provider_key,url,status,last_received_at from public.webhook_endpoints where tenant_id=$1 and connection_mode='middleware_bridge' order by created_at desc", [tenantId]
    ),
    queryPostgres<{ provider: string; status: string; metadata_json: { lastReadSyncAt?: string; writeBackEnabled?: boolean } | null }>(
      "select provider,status,metadata_json from public.integration_connections where tenant_id=$1 and provider='jobber' limit 1", [tenantId]
    ),
    queryPostgres<{ object_type: string; count: string }>(
      "select object_type,count(*)::text as count from public.external_service_platform_records where tenant_id=$1 and provider_key='jobber' and provider_deleted_at is null group by object_type order by object_type", [tenantId]
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
      return <article className="panel span-4 form-stack" key={platform.key}><div className="list-row flush-row"><h2><ArrowRightLeft size={18} /> {platform.name}</h2><span className="pill">{nativeJobber ? "Connected read-only" : active ? "Bridge ready" : "Available"}</span></div><p>{platform.body}</p><p className="muted">{platform.mode}</p>{platform.key === "jobber" ? nativeJobber ? <><form action={syncJobberReadModelAction}><button className="button" type="submit">Refresh Jobber analysis</button></form><p className="muted">Last read: {jobberConnection.metadata_json?.lastReadSyncAt || "Ready for first sync"}</p><p className="muted">Write-back: Off</p></> : <Link className="button" href="/api/integrations/jobber/oauth/start">Connect Jobber</Link> : null}{active ? <><code>{active.url}</code><p className="muted">Last update: {active.last_received_at || "Waiting for first event"}</p></> : <form action={createServicePlatformBridgeAction}><input name="providerKey" type="hidden" value={platform.key} /><button className="button secondary-button" type="submit">{platform.key === "jobber" ? "Use bridge instead" : "Create secure bridge"}</button></form>}<p className="muted"><ShieldCheck size={14} /> Incoming deletes detach the mapping; Ferocity does not erase customer history.</p></article>;
    })}</section>
    {recordResult?.rows.length ? <section className="panel"><h2>Jobber business view</h2><p className="muted">Provider-owned summaries available to Ferocity analysis.</p><div className="button-row">{recordResult.rows.map((row) => <span className="pill" key={row.object_type}>{row.object_type}: {row.count}</span>)}</div></section> : null}
    <section className="panel"><h2>Supported bridge events</h2><p>Contact, lead, and job upserts use external IDs for safe retries. Ferocity deduplicates customers by mapping, email, or phone and never turns on outbound writes automatically.</p></section>
  </QueuePageShell>;
}
