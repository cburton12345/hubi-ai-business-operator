import Link from "next/link";
import { CalendarDays, RefreshCw, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { refreshCalendarChoicesAction, runCalendarSyncAction, saveCalendarSettingsAction } from "./actions";

type Choice = { id: string; name: string; primary: boolean; writable: boolean; timeZone: string | null };

export default async function CalendarConnectionsPage({ searchParams }: { searchParams: Promise<{ synced?: string; written?: string; conflicts?: string; reset?: string }> }) {
  const tenantId = await getCurrentWorkspaceId();
  const params = await searchParams;
  const result = await queryPostgres<{
    id: string; provider: "google_calendar" | "microsoft_calendar"; display_name: string; status: string;
    metadata_json: { calendarChoices?: Choice[] } | null; external_calendar_id: string | null; external_calendar_name: string | null;
    sync_direction: string | null; conflict_policy: string | null; outbound_writes_enabled: boolean | null;
    cursor_status: string | null; last_completed_at: string | null; last_error: string | null;
  }>(
    `select c.id,c.provider,c.display_name,c.status,c.metadata_json,s.external_calendar_id,s.external_calendar_name,s.sync_direction,
       s.conflict_policy,s.outbound_writes_enabled,sc.status as cursor_status,sc.last_completed_at,sc.last_error
     from public.integration_connections c left join public.calendar_sync_settings s on s.connection_id=c.id
     left join public.integration_sync_cursors sc on sc.connection_id=c.id and sc.resource_type='calendar_events' and sc.external_scope=coalesce(s.external_calendar_id,'')
     where c.tenant_id=$1 and c.provider in ('google_calendar','microsoft_calendar') order by c.provider`, [tenantId]
  );
  const rows = result?.rows ?? [];
  return <QueuePageShell eyebrow="Calendar connections" title="Keep the schedule in sync" description="Connect the calendar the business already uses. Ferocity reads availability first and never turns on calendar writes just because an account was connected.">
    <div className="button-row section-actions"><Link className="button secondary-button" href="/app/integrations">All integrations</Link><Link className="button secondary-button" href="/app/schedule">Ferocity schedule</Link></div>
    {params.synced ? <section className="panel"><strong>Calendar sync complete.</strong><p className="muted">Imported {params.synced} change(s), wrote {params.written ?? "0"} authorized Ferocity appointment(s), and found {params.conflicts ?? "0"} possible conflict(s).{params.reset ? " The provider requested a clean resync; run Sync again." : ""}</p></section> : null}
    <section className="grid">{(["google_calendar", "microsoft_calendar"] as const).map((providerKey) => {
      const row = rows.find((item) => item.provider === providerKey); const choices = row?.metadata_json?.calendarChoices ?? [];
      const label = providerKey === "google_calendar" ? "Google Calendar" : "Microsoft Outlook Calendar";
      const selected = choices.find((choice) => choice.id === row?.external_calendar_id) ?? choices.find((choice) => choice.primary) ?? choices[0];
      return <article className="panel span-6 form-stack" key={providerKey}>
        <div className="list-row flush-row"><div><h2><CalendarDays size={18} /> {label}</h2><p className="muted">{row?.status === "connected" ? "Account connected" : "Not connected yet"}</p></div><span className="pill">{row?.cursor_status ?? "not synced"}</span></div>
        {row?.status !== "connected" ? <Link className="button" href={`/api/integrations/${providerKey}/oauth/start`}>Connect {label}</Link> : <>
          <form action={refreshCalendarChoicesAction}><input name="providerKey" type="hidden" value={providerKey} /><button className="mini-button" type="submit"><RefreshCw size={14} /> Find my calendars</button></form>
          {choices.length ? <form action={saveCalendarSettingsAction} className="form-stack">
            <input name="providerKey" type="hidden" value={providerKey} />
            <label>Calendar<select name="calendarId" defaultValue={selected?.id}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}{choice.primary ? " (Primary)" : ""}</option>)}</select></label>
            <label>Sync behavior<select name="syncDirection" defaultValue={row.sync_direction ?? "inbound"}><option value="inbound">Read availability only (Recommended)</option><option value="two_way">Keep both calendars aligned</option><option value="outbound">Send Ferocity appointments only</option></select></label>
            <label>When both sides changed<select name="conflictPolicy" defaultValue={row.conflict_policy ?? "review"}><option value="review">Ask me to review (Recommended)</option><option value="ferocity_wins">Use Ferocity</option><option value="provider_wins">Use connected calendar</option></select></label>
            <label className="checkbox-row"><input name="outboundWritesEnabled" type="checkbox" value="true" defaultChecked={row.outbound_writes_enabled === true} /><span>Allow Ferocity to create or update its own appointments in this calendar</span></label>
            <button className="button" type="submit">Save calendar choice</button>
          </form> : <p className="muted">Choose “Find my calendars” to finish setup.</p>}
          {row.external_calendar_id ? <form action={runCalendarSyncAction}><input name="providerKey" type="hidden" value={providerKey} /><button className="button" type="submit">Sync now</button></form> : null}
          <p className="muted"><ShieldCheck size={14} /> External events remain provider-owned. They affect availability but do not become Ferocity jobs automatically.</p>
          {row.last_error ? <p className="muted">Last issue: {row.last_error}</p> : null}
        </>}
      </article>;
    })}</section>
  </QueuePageShell>;
}
