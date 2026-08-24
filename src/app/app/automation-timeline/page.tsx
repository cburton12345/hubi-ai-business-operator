import Link from "next/link";
import { Bot, CheckCircle2, Clock3, ShieldAlert, ShieldCheck, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAutomationTimelineDashboard, type AutomationTimelineEvent } from "@/lib/automation-timeline/get-automation-timeline";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusClass(status: string) {
  if (["blocked", "failed", "unknown", "needs_attention"].includes(status)) return "high";
  if (status === "delayed") return "medium";
  if (status === "needs_approval") return "medium";
  if (status === "prepared") return "draft";
  return "";
}

function actionLabel(event: AutomationTimelineEvent) {
  if (event.status === "blocked") return "Needs help";
  if (event.status === "needs_approval") return "Needs approval";
  if (event.status === "prepared") return "Prepared";
  if (event.status === "synced") return "Synced";
  if (event.status === "handled") return "Handled";
  if (["planned", "queued", "attempted", "provider_accepted", "delivered", "confirmed", "completed", "failed", "delayed", "unknown", "needs_attention"].includes(event.status)) {
    return event.status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
  }
  return "Logged";
}

export default async function AutomationTimelinePage() {
  const timeline = await getAutomationTimelineDashboard();

  return (
    <QueuePageShell
      eyebrow="Trust feed"
      title="Automation Timeline"
      description="A live audit trail of what Ferocity prepared, changed, synced, blocked, or needs approved. This is how owners see the AI working."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Workflow size={18} /> What Ferocity Has Been Doing
            </h2>
            <p className="muted">
              Automations should not feel hidden. This feed pulls from the shared operator timeline so AI Workforce, setup, SEO, marketing,
              leads, jobs, invoices, integrations, and owner events show up in one place.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/ai-workforce">AI Workforce</Link>
            <Link className="button secondary-button" href="/app/business-brain">Business Info</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric icon={<Clock3 size={18} />} label="30-day events" value={timeline.metrics.total} />
        <Metric icon={<Bot size={18} />} label="Prepared" value={timeline.metrics.prepared} />
        <Metric icon={<ShieldCheck size={18} />} label="Needs approval" value={timeline.metrics.needsApproval} />
        <Metric icon={<ShieldAlert size={18} />} label="Blocked" value={timeline.metrics.blocked} tone={timeline.metrics.blocked ? "high" : ""} />
        <Metric icon={<CheckCircle2 size={18} />} label="Handled" value={timeline.metrics.aiHandled} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-4">
          <h2>Event Families</h2>
          <ul className="list">
            {timeline.familyCounts.map((row) => (
              <li className="list-row" key={row.label}>
                <strong>{row.label.replaceAll("_", " ")}</strong>
                <span className="pill">{row.count}</span>
              </li>
            ))}
            {timeline.familyCounts.length === 0 ? <li className="list-row"><span className="muted">No timeline events yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-8">
          <h2>Recent Automation Activity</h2>
          <ul className="timeline-list">
            {timeline.events.map((event) => (
              <li className="timeline-item" key={event.id}>
                <div className="list-row flush-row">
                  <div>
                    <span className="eyebrow">{dateLabel(event.occurredAt)}</span>
                    <h3>{event.title}</h3>
                    {event.body ? <p>{event.body}</p> : null}
                    <p className="muted">
                      {event.family} / {event.type}
                      {event.sourceTable ? ` / ${event.sourceTable}` : ""}
                      {event.primaryEntityType ? ` / ${event.primaryEntityType}` : ""}
                    </p>
                  </div>
                  <span className={`pill ${statusClass(event.status)}`}>{actionLabel(event)}</span>
                </div>
              </li>
            ))}
            {timeline.events.length === 0 ? (
              <li className="timeline-item">
                <h3>No automation timeline yet</h3>
                <p className="muted">Run AI Workforce, setup, scans, SEO, lead follow-up, or integrations to populate this feed.</p>
              </li>
            ) : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <section className="panel span-4 metric">
      {icon}
      <span className="muted">{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small className={`pill ${tone}`}>timeline</small>
    </section>
  );
}
