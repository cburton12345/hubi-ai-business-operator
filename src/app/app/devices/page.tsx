import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgresRequired } from "@/lib/db/postgres";
import { revokeOtherTrustedDevicesAction, revokeTrustedDeviceAction } from "./actions";

export const dynamic = "force-dynamic";

function when(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function TrustedDevicesPage() {
  const session = await getCurrentAppSession();
  const rows = session
    ? (await queryPostgresRequired<{
        id: string; device_label: string | null; last_seen_at: Date; expires_at: Date;
        authenticated_at: Date; authentication_method: string;
      }>(
        `select id,device_label,last_seen_at,expires_at,authenticated_at,authentication_method
         from public.app_sessions
         where user_id=$1 and revoked_at is null and expires_at>now() and absolute_expires_at>now()
         order by last_seen_at desc`,
        [session.userId],
        "trusted-device-list",
      )).rows
    : [];

  return (
    <QueuePageShell eyebrow="Account security" title="Trusted devices" description="Stay signed in on devices you trust. Remove a lost, shared, or unfamiliar device immediately.">
      <section className="panel form-stack">
        <div className="list-row flush-row">
          <div><h2>Signed-in devices</h2><p className="muted">Active use renews a session for up to 90 days, with a hard one-year identity-check ceiling.</p></div>
          {rows.length > 1 ? <form action={revokeOtherTrustedDevicesAction}><button className="mini-button secondary-button" type="submit">Sign out other devices</button></form> : null}
        </div>
        <ul className="list">
          {rows.map((row) => {
            const current = row.id === session?.sessionId;
            return <li className="list-row" key={row.id}>
              <div>
                <h3>{row.device_label ?? "Trusted device"} {current ? <span className="pill">This device</span> : null}</h3>
                <p className="muted">Last active {when(row.last_seen_at)} / expires {when(row.expires_at)}</p>
                <p className="muted">Identity verified {when(row.authenticated_at)} by {row.authentication_method.replaceAll("_", " ")}</p>
              </div>
              {!current ? <form action={revokeTrustedDeviceAction}><input name="sessionId" type="hidden" value={row.id} /><button className="mini-button secondary-button" type="submit">Sign out</button></form> : null}
            </li>;
          })}
          {rows.length === 0 ? <li className="list-row"><span className="muted">No application session is available. Platform recovery sessions are managed separately.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}
