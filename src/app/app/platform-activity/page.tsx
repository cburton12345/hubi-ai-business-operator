import { redirect } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getPlatformActivity, type PlatformActivityItem } from "@/lib/platform/get-platform-activity";
import { updatePlatformSupportStatusAction } from "./actions";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
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
        <Metric label="Checkouts started · 30 days" value={activity.metrics.checkoutStarted30d} />
        <Metric label="Reached Stripe · 30 days" value={activity.metrics.checkoutRedirected30d} />
        <Metric label="Paid subscribers · 30 days" value={activity.metrics.paid30d} />
        <Metric label="Verified first value · 30 days" value={activity.metrics.activated30d} />
        <Metric label="Customers needing recovery" value={activity.metrics.atRisk} />
        <Metric label="Abandoned checkout · 30 days" value={activity.metrics.abandonedCheckout30d} />
        <Metric label="Provisioning stuck" value={activity.metrics.stalledProvisioning} />
        <Metric label="Checkout failures · 30 days" value={activity.metrics.failedCheckout30d} />
        <Metric label="Subscription cash collected · this month" value={money(activity.metrics.collectedMonthCents)} />
        <Metric label="Subscription refunds · this month" value={money(activity.metrics.refundedMonthCents)} />
        <Metric label="Net subscription cash · this month" value={money(activity.metrics.netCollectedMonthCents)} />
        <Metric label="Recorded provider costs · this month" value={money(activity.metrics.providerCostMonthCents)} />
        <Metric label="Subscription cash less provider costs" value={money(activity.metrics.netCollectedMonthCents - activity.metrics.providerCostMonthCents)} />
        <Metric label="Subscription payments at risk" value={money(activity.metrics.paymentRiskCents)} />
        <Metric label="Active plan value · monthly" value={money(activity.metrics.activePlanValueCents)} />
        <Metric label="Past-due plan value · monthly" value={money(activity.metrics.atRiskPlanValueCents)} />
        <Metric label="Open support requests" value={activity.metrics.openSupport} />
      </section>
      <section className="panel">
        <h2>Ferocity service funnel · 30 days</h2>
        <ul className="list">
          <li className="list-row"><span>Checkout reached Stripe</span><strong>{percent(activity.metrics.checkoutRedirected30d, activity.metrics.checkoutStarted30d)}</strong></li>
          <li className="list-row"><span>Started checkout became paid</span><strong>{percent(activity.metrics.paid30d, activity.metrics.checkoutStarted30d)}</strong></li>
          <li className="list-row"><span>Paid workspace reached verified first value</span><strong>{percent(activity.metrics.activated30d, activity.metrics.paid30d)}</strong></li>
        </ul>
        <p className="muted">Cash and refunds come from verified Stripe invoice and charge events. “Cash less provider costs” is not accounting profit: it excludes payroll, infrastructure not recorded as usage, taxes, and other operating costs. Plan value remains separate from collected cash.</p>
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

function Metric({ label, value }: { label: string; value: number | string }) {
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
            <div>
              <strong>{row.title}</strong>
              <p>{row.detail}</p>
              {row.contact ? <p><strong>Contact:</strong> {row.contact}</p> : null}
              {row.summary ? <p>{row.summary}</p> : null}
              <span className="muted">{dateLabel(row.occurredAt)}</span>
            </div>
            {row.supportIssueId ? (
              <form action={updatePlatformSupportStatusAction} className="inline-actions">
                <input type="hidden" name="issueId" value={row.supportIssueId} />
                <select name="status" defaultValue={row.status} aria-label={`Status for ${row.title}`}>
                  <option value="open">Received</option>
                  <option value="reviewing">In review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
                <button className="mini-button" type="submit">Save</button>
              </form>
            ) : <span className="pill">{row.status}</span>}
          </li>
        ))}
        {!rows.length ? <li className="list-row"><span className="muted">Nothing here yet.</span></li> : null}
      </ul>
    </section>
  );
}
