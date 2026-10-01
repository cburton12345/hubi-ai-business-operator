import Link from "next/link";
import { Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { syncMailboxAction } from "./actions";

type Connection = { provider_key: "gmail_mailbox" | "microsoft_mailbox"; account_email: string | null; status: string; send_enabled: boolean; last_synced_at: string | null; last_error: string | null };
type Message = { id: string; provider_key: string; sender_json: { name?: string; email?: string }; subject: string | null; preview: string | null; received_at: string; classification: string; action_status: string; source_url: string | null };

export default async function EmailWatchPage({ searchParams }: { searchParams: Promise<{ synced?: string; saved?: string; error?: string }> }) {
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const [connectionsResult, messagesResult] = await Promise.all([
    queryPostgres<Connection>(`select provider_key,account_email,status,send_enabled,last_synced_at,last_error from public.mailbox_connections where tenant_id=$1 order by provider_key`, [tenantId]),
    queryPostgres<Message>(`select m.id,c.provider_key,m.sender_json,m.subject,m.preview,m.received_at,m.classification,m.action_status,m.source_url from public.mailbox_messages m join public.mailbox_connections c on c.id=m.connection_id where m.tenant_id=$1 order by m.received_at desc limit 75`, [tenantId])
  ]);
  const connections = connectionsResult?.rows ?? [];
  const messages = messagesResult?.rows ?? [];
  const attention = messages.filter((message) => message.action_status === "needs_attention").length;

  return <QueuePageShell eyebrow="Email Watch" title="Let Ferocity watch the inbox" description="Connect the business inbox so Ferocity can organize leads, customer needs, billing messages, and urgent issues without silently gaining permission to send.">
    <div className="button-row section-actions"><Link className="button secondary-button" href="/app/integrations">All connections</Link><Link className="button secondary-button" href="/app/ferocity">Ask Ferocity</Link></div>
    {params.synced ? <section className="panel"><strong>Inbox checked.</strong><p className="muted">Reviewed {params.synced} recent message(s) and safely saved {params.saved ?? "0"}.</p></section> : null}
    {params.error ? <section className="panel"><strong>The inbox could not be checked.</strong><p className="muted">Reconnect the account if the issue continues. Existing messages remain available.</p></section> : null}
    <section className="grid section-actions">
      <article className="panel span-4 metric"><span className="muted">Connected inboxes</span><strong>{connections.length}</strong></article>
      <article className="panel span-4 metric"><span className="muted">Recent messages</span><strong>{messages.length}</strong></article>
      <article className="panel span-4 metric"><span className="muted">Need attention</span><strong>{attention}</strong></article>
    </section>
    <section className="grid section-actions">
      {(["gmail_mailbox", "microsoft_mailbox"] as const).map((provider) => {
        const connection = connections.find((item) => item.provider_key === provider);
        const label = provider === "gmail_mailbox" ? "Gmail" : "Microsoft 365 / Outlook";
        return <article className="panel span-6 form-stack" key={provider}>
          <div className="list-row flush-row"><div><h2><Mail size={18} /> {label}</h2><p className="muted">{connection?.account_email ?? "Not connected"}</p></div><span className="pill">{connection?.status ?? "not connected"}</span></div>
          {!connection ? <Link className="button" href={`/api/integrations/${provider}/oauth/start`}>Connect {label}</Link> : <form action={syncMailboxAction}><input type="hidden" name="provider" value={provider} /><button className="button" type="submit"><RefreshCw size={15} /> Check inbox now</button></form>}
          <p className="muted"><ShieldCheck size={14} /> Inbox access is read-only. Sending is {connection?.send_enabled ? "separately enabled" : "not authorized"}.</p>
          {connection?.last_synced_at ? <p className="muted">Last checked {new Date(connection.last_synced_at).toLocaleString()}</p> : null}
          {connection?.last_error ? <p className="muted">Needs attention: {connection.last_error}</p> : null}
        </article>;
      })}
    </section>
    <section className="panel section-actions"><div className="list-row flush-row"><div><h2>Recent inbox activity</h2><p className="muted">Ferocity highlights messages that look like new work, money, support, or urgent customer needs.</p></div><span className="pill">Read only</span></div>
      {messages.length ? <ul className="list">{messages.map((message) => <li className="list-row" key={message.id}><div><strong>{message.subject || "(No subject)"}</strong><p className="muted">{message.sender_json.name || message.sender_json.email || "Unknown sender"} · {message.preview?.slice(0, 180)}</p></div><div className="inline-actions"><span className="pill">{message.classification}</span>{message.source_url ? <a className="mini-button" href={message.source_url} target="_blank" rel="noreferrer">Open email</a> : null}</div></li>)}</ul> : <p className="muted">Connect an inbox and choose “Check inbox now.”</p>}
    </section>
  </QueuePageShell>;
}
