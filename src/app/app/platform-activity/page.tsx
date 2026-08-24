import { redirect } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getPlatformActivity, type PlatformActivityItem } from "@/lib/platform/get-platform-activity";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function PlatformActivityPage() {
  const [session, legacyAdmin] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!legacyAdmin && session?.platformRole !== "super_admin") redirect("/app");
  const activity = await getPlatformActivity();

  return (
    <QueuePageShell
      eyebrow="Ferocity Business"
      title="Visitors, Subscribers, Payments & Support"
      description="One private owner view of demand, paid customer activity, and people who need help. Customer workspaces remain isolated."
    >
      <section className="grid section-actions">
        <Metric label="Visits · 24 hours" value={activity.metrics.views24h} />
        <Metric label="Visits · 7 days" value={activity.metrics.views7d} />
        <Metric label="Visits · 30 days" value={activity.metrics.views30d} />
        <Metric label="Paid subscribers · 30 days" value={activity.metrics.paid30d} />
        <Metric label="Open support requests" value={activity.metrics.openSupport} />
      </section>
      <div className="grid section-actions">
        <Ranked title="Top pages · 30 days" rows={activity.pages} />
        <Ranked title="Traffic sources · 30 days" rows={activity.sources} />
        <ActivityList title="Recent subscription activity" rows={activity.subscriptions} />
        <ActivityList title="Support queue" rows={activity.support} anchor="support" />
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="panel span-4 metric"><span className="muted">{label}</span><strong>{value}</strong></section>;
}

function Ranked({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => <li className="list-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}
        {!rows.length ? <li className="list-row"><span className="muted">No activity recorded yet.</span></li> : null}
      </ul>
    </section>
  );
}

function ActivityList({ title, rows, anchor }: { title: string; rows: PlatformActivityItem[]; anchor?: string }) {
  return (
    <section className="panel span-6" id={anchor}>
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div><strong>{row.title}</strong><p>{row.detail}</p><span className="muted">{dateLabel(row.occurredAt)}</span></div>
            <span className="pill">{row.status}</span>
          </li>
        ))}
        {!rows.length ? <li className="list-row"><span className="muted">Nothing here yet.</span></li> : null}
      </ul>
    </section>
  );
}
