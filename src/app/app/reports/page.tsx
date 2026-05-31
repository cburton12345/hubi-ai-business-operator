import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import Link from "next/link";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function ReportsPage() {
  const [snapshot, report] = await Promise.all([getDashboardSnapshot(), getReportingDashboard()]);

  return (
    <QueuePageShell
      eyebrow="Reporting"
      title="Workspace Performance"
      description="Lead, content, approval, AI generation, and integration-readiness reporting for the selected organization."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Business Command Center</h2>
            <p className="muted">What is working, what is stuck, and what to do next.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">Build My System</Link>
            <Link className="button secondary-button" href="/app/operator">Open operator console</Link>
            <Link className="button secondary-button" href="/app/growth">Open growth loop</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Revenue collected" value={money(report.leadToRevenue.collectedRevenueCents)} />
          <Metric label="Open pipeline" value={money(report.leadToRevenue.openPipelineCents)} />
          <Metric label="Needs attention" value={snapshot.todayPlan.length + report.activeAlerts} />
          <Metric label="Provider gaps" value={report.providerGaps.length} />
        </div>
      </section>

      <div className="grid section-actions">
        <section className="panel span-6">
          <h2>Problems Needing Attention</h2>
          <ul className="list">
            {snapshot.todayPlan.slice(0, 5).map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <Link className="mini-button" href={item.href}>{item.buttonLabel}</Link>
              </li>
            ))}
            {snapshot.todayPlan.length === 0 ? <li className="list-row"><span className="muted">No urgent operator problems found right now.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Recommended Actions</h2>
          <ul className="list">
            <li className="list-row">
              <div>
                <h3>Set up what is missing</h3>
                <p className="muted">Use plain English to create a reviewed setup plan for workflows, SEO, reviews, automations, and providers.</p>
              </div>
              <Link className="mini-button" href="/app/build-system">Build</Link>
            </li>
            <li className="list-row">
              <div>
                <h3>Close provider gaps</h3>
                <p className="muted">{report.providerGaps.length} provider gaps are keeping Ferocity in manual or review mode.</p>
              </div>
              <Link className="mini-button" href="/app/integrations">Connect</Link>
            </li>
            <li className="list-row">
              <div>
                <h3>Protect spend and tokens</h3>
                <p className="muted">Review AI, SMS, email, publishing, and ads limits before turning on live actions.</p>
              </div>
              <Link className="mini-button" href="/app/controls">Controls</Link>
            </li>
          </ul>
        </section>
      </div>

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
        <Metric label="Won jobs" value={report.leadToRevenue.wonJobs} />
        <Metric label="Unpaid invoices" value={report.leadToRevenue.unpaidInvoices} />
        <Metric label="Collected revenue" value={money(report.leadToRevenue.collectedRevenueCents)} />
        <Metric label="Open pipeline" value={money(report.leadToRevenue.openPipelineCents)} />
      </div>

      <div className="grid">
        <Breakdown title="Leads by Brand" rows={snapshot.reporting.leadsByBrand} />
        <Breakdown title="Leads by Source" rows={snapshot.reporting.leadsBySource} />
        <Breakdown title="Leads by Campaign" rows={snapshot.reporting.leadsByCampaign} />
      </div>

      <div className="grid section-actions">
        <section className="panel span-12">
          <h2>Lead To Revenue Funnel</h2>
          <div className="grid">
            <Metric label="Leads" value={report.leadToRevenue.leads} />
            <Metric label="Opportunities" value={report.leadToRevenue.opportunities} />
            <Metric label="Open estimates" value={report.leadToRevenue.openEstimates} />
            <Metric label="Won jobs" value={report.leadToRevenue.wonJobs} />
          </div>
        </section>

        <section className="panel span-6">
          <h2>Channel ROI</h2>
          <p className="muted">Revenue and spend by source family. Live ad/analytics imports will make this sharper when connected.</p>
          <ul className="list">
            {report.channelRoi.map((row) => (
              <li className="list-row" key={row.label}>
                <div>
                  <h3>{row.label}</h3>
                  <p className="muted">{row.leads} leads / {row.jobs} jobs / spend {money(row.spendCents)}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{money(row.revenueCents)}</span>
                  <span className="pill">{row.roiLabel}</span>
                </div>
              </li>
            ))}
            {report.channelRoi.length === 0 ? <li className="list-row"><span className="muted">No channel ROI data yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Service And City Winners</h2>
          <p className="muted">Which services and areas are tied to leads, jobs, and revenue.</p>
          <ul className="list">
            {report.serviceCityRevenue.map((row) => (
              <li className="list-row" key={row.label}>
                <div>
                  <h3>{row.label}</h3>
                  <p className="muted">{row.leads} leads / {row.jobs} jobs</p>
                </div>
                <span className="pill">{money(row.revenueCents)}</span>
              </li>
            ))}
            {report.serviceCityRevenue.length === 0 ? <li className="list-row"><span className="muted">No service/city revenue data yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Reputation Scoreboard</h2>
          <ul className="list">
            <li className="list-row"><strong>Review requests</strong><span className="pill">{report.reputation.reviewRequests}</span></li>
            <li className="list-row"><strong>Completed requests</strong><span className="pill">{report.reputation.completedRequests}</span></li>
            <li className="list-row"><strong>Service recovery</strong><span className="pill high">{report.reputation.serviceRecovery}</span></li>
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Provider Gaps</h2>
          <p className="muted">The missing connections that keep Ferocity in reviewed/manual mode.</p>
          <ul className="list">
            {report.providerGaps.map((gap) => (
              <li className="list-row" key={gap.provider}>
                <div>
                  <h3>{gap.displayName}</h3>
                  <p className="muted">{gap.nextStep}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{gap.status}</span>
                  <span className="pill">{gap.credentialsStatus}</span>
                </div>
              </li>
            ))}
            {report.providerGaps.length === 0 ? <li className="list-row"><span className="muted">No provider gaps found.</span></li> : null}
          </ul>
        </section>
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

function Metric({ label, value }: { label: string; value: number | string }) {
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
