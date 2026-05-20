import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";

export default async function ReportsPage() {
  const [snapshot, report] = await Promise.all([getDashboardSnapshot(), getReportingDashboard()]);

  return (
    <QueuePageShell
      eyebrow="Reporting"
      title="Workspace Performance"
      description="Lead, content, approval, AI generation, and integration-readiness reporting for the selected organization."
    >
      <div className="grid section-actions">
        <Metric label="Open leads" value={snapshot.metrics.openLeads} />
        <Metric label="Content this week" value={snapshot.metrics.contentCreatedThisWeek} />
        <Metric label="Pending approvals" value={snapshot.metrics.pendingApprovals} />
        <Metric label="AI recommendations" value={snapshot.metrics.aiRecommendations} />
        <Metric label="AI runs" value={report.aiRuns} />
        <Metric label="Fallback runs" value={report.fallbackRuns} />
        <Metric label="Exports created" value={report.exportsCreated} />
        <Metric label="Content versions" value={report.contentVersions} />
        <Metric label="Active alerts" value={report.activeAlerts} />
      </div>

      <div className="grid">
        <Breakdown title="Leads by Brand" rows={snapshot.reporting.leadsByBrand} />
        <Breakdown title="Leads by Source" rows={snapshot.reporting.leadsBySource} />
        <Breakdown title="Leads by Campaign" rows={snapshot.reporting.leadsByCampaign} />
      </div>

      <section className="panel section-actions">
        <h2>Recent Analytics Events</h2>
        <ul className="list">
          {report.recentEvents.map((event) => (
            <li className="list-row" key={event.id}>
              <div>
                <strong>{event.type}</strong>
                <span className="muted">{event.source} / {event.campaign}</span>
              </div>
              <span className="pill">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(event.occurredAt))}</span>
            </li>
          ))}
          {report.recentEvents.length === 0 ? <li className="list-row"><span className="muted">No analytics events have been recorded yet.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <section className="panel span-4">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.label}>
            <strong>{row.label}</strong>
            <span className="pill">{row.count}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">No lead data yet</span></li> : null}
      </ul>
    </section>
  );
}
