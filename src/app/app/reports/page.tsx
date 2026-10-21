import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getOwnerNeeds, type OwnerNeed } from "@/lib/owner-command-center/get-owner-needs";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getServicePerformanceDashboard } from "@/lib/reports/get-service-performance-dashboard";
import Link from "next/link";
import { GrowthBaselineForm } from "./GrowthBaselineForm";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function ReportsPage() {
  const [snapshot, report, ownerNeeds, service] = await Promise.all([
    getDashboardSnapshot(),
    getReportingDashboard(),
    getOwnerNeeds(),
    getServicePerformanceDashboard()
  ]);
  const currentYear = new Date().getFullYear();

  return (
    <QueuePageShell
      eyebrow="Reporting"
      title="Business Performance"
      description="See results, trends, money, service delivery, and the few areas that need attention."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Business summary</h2>
            <p className="muted">What is working, what is stuck, and what to do next.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/ferocity">Ask Ferocity</Link>
            <Link className="button secondary-button" href="/app/operator">Sales pipeline</Link>
            <Link className="button secondary-button" href="/app/growth">Growth</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Revenue collected" value={money(report.leadToRevenue.collectedRevenueCents)} />
          <Metric label="Open pipeline" value={money(report.leadToRevenue.openPipelineCents)} />
          <Metric label="Needs attention" value={snapshot.todayPlan.length + report.activeAlerts + ownerNeeds.length} />
          <Metric label="Missing connections" value={report.providerGaps.length} />
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Service Delivery Performance</h2>
            <p className="muted">Completed visits, arrival times, assignments, capacity, callbacks, and pricing show how reliably work is being delivered.</p>
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/app/schedule">Open schedule</Link>
            <Link className="mini-button secondary-button" href="/app/pricebook">Pricebook</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Visits / 30 days" value={service.metrics.visits30d} />
          <Metric label="Completion rate" value={`${service.metrics.completionRate}%`} />
          <Metric label="On-time arrival" value={`${service.metrics.onTimeRate}%`} />
          <Metric label="7-day capacity booked" value={`${service.metrics.capacityBooked}%`} />
          <Metric label="Active memberships" value={service.metrics.activeMemberships} />
          <Metric label="Membership visits due" value={service.metrics.membershipVisitsDue} />
          <Metric label="Warranties expiring" value={service.metrics.warrantiesExpiring} />
          <Metric label="Open callbacks / inbox" value={`${service.metrics.openCallbacks} / ${service.metrics.openInbox}`} />
          <Metric label="No-shows / cancellations" value={`${service.metrics.noShows} / ${service.metrics.cancellations}`} />
          <Metric label="Average pricebook margin" value={`${service.metrics.averagePricebookMargin}%`} />
        </div>
        <details className="panel subtle-panel">
          <summary>See technician and service breakdown</summary>
          <div className="grid section-actions">
            <section className="panel span-7 subtle-panel">
              <h3>Technician delivery</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Worker</th><th>Assigned</th><th>Completed</th><th>On time</th><th>Avg duration</th></tr></thead>
                  <tbody>
                    {service.workers.map((worker) => (
                      <tr key={worker.id}>
                        <th scope="row">{worker.name}</th>
                        <td>{worker.assigned}</td>
                        <td>{worker.completed}</td>
                        <td>{worker.onTimeRate === null ? "Not measured" : `${worker.onTimeRate}%`}</td>
                        <td>{worker.averageMinutes ? `${worker.averageMinutes} min` : "Not measured"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {service.workers.length === 0 ? <p className="muted">Completed assigned visits will populate technician reporting.</p> : null}
            </section>
            <section className="panel span-5 subtle-panel">
              <h3>Service-type throughput</h3>
              <ul className="list">
                {service.serviceTypes.map((item) => (
                  <li className="list-row" key={item.label}>
                    <div><strong>{item.label}</strong><p className="muted">{item.completed}/{item.visits} complete · {item.averageDurationMinutes || "No"} average minutes</p></div>
                  </li>
                ))}
                {service.serviceTypes.length === 0 ? <li className="list-row"><span className="muted">No canonical visit history yet.</span></li> : null}
              </ul>
            </section>
          </div>
        </details>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Growth Since Day One</h2>
            <p className="muted">{report.growthSinceBaseline.summary}</p>
          </div>
          <div className="inline-actions">
            <span className={`pill ${report.growthSinceBaseline.hasBaseline ? "" : "medium"}`}>
              {report.growthSinceBaseline.hasBaseline ? report.growthSinceBaseline.confidence.replaceAll("_", " ") : "baseline needed"}
            </span>
            {report.growthSinceBaseline.baselineDate ? (
              <span className="pill">
                since {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(report.growthSinceBaseline.baselineDate))}
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid section-actions">
          <Metric
            label="Revenue change"
            value={`${money(report.growthSinceBaseline.revenue.changeCents)}${formatPct(report.growthSinceBaseline.revenue.changePct)}`}
          />
          <Metric label="Lead change" value={formatDelta(report.growthSinceBaseline.leads.change, report.growthSinceBaseline.leads.changePct)} />
          <Metric label="Booked job change" value={formatDelta(report.growthSinceBaseline.jobs.change, report.growthSinceBaseline.jobs.changePct)} />
          <Metric label="Review requests this month" value={report.growthSinceBaseline.reviews.current} />
        </div>
        <details className="panel subtle-panel">
          <summary>{report.growthSinceBaseline.hasBaseline ? "Update baseline" : "Add day-one baseline"}</summary>
          <p className="muted">
            Add the best known numbers from before Ferocity or day one. Revenue, leads, and jobs compare this month-to-date against
            that baseline month. Review counts stay provider-verified once review connections are live.
          </p>
          <GrowthBaselineForm />
        </details>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Tax Export And Management P&amp;L</h2>
            <p className="muted">
              Download a clean management P&amp;L plus the supporting expense records your bookkeeper needs. Ferocity
              excludes unreviewed costs and flags possible vendor-bill or material duplicates instead of quietly
              understating profit.
            </p>
          </div>
          <div className="button-row">
            <Link className="mini-button" href={`/api/reports/profit-loss?year=${currentYear}&basis=cash`}>{currentYear} cash P&amp;L</Link>
            <Link className="mini-button secondary-button" href="/app/job-tracker">Add receipt</Link>
            <Link className="mini-button secondary-button" href="/app/operations-workforce">Review costs</Link>
          </div>
        </div>
        <details className="panel subtle-panel">
          <summary>More tax and accounting exports</summary>
          <div className="button-row section-actions">
            <Link className="mini-button" href={`/api/reports/profit-loss?year=${currentYear}&basis=accrual`}>{currentYear} accrual P&amp;L</Link>
            <Link className="mini-button secondary-button" href={`/app/reports/expense-tax-print?year=${currentYear}`}>{currentYear} printable property packet</Link>
            <Link className="mini-button secondary-button" href={`/app/reports/income-tax-print?year=${currentYear}`}>{currentYear} printable deposits packet</Link>
            <Link className="mini-button secondary-button" href={`/app/reports/statement-packets?year=${currentYear}`}>{currentYear} reconciled statement packets</Link>
            <Link className="mini-button secondary-button" href={`/api/reports/expense-tax-export?year=${currentYear}`}>{currentYear} expense detail</Link>
            <Link className="mini-button secondary-button" href={`/api/reports/profit-loss?year=${currentYear - 1}&basis=cash`}>{currentYear - 1} cash P&amp;L</Link>
            <Link className="mini-button secondary-button" href={`/api/reports/expense-tax-export?year=${currentYear - 1}`}>{currentYear - 1} expense detail</Link>
          </div>
        </details>
        <div className="grid section-actions">
          <Metric label="YTD expenses" value={money(report.expenseSummary.ytdExpenseCents)} />
          <Metric label="YTD tax captured" value={money(report.expenseSummary.ytdTaxCents)} />
          <Metric label="YTD job costs" value={money(report.expenseSummary.ytdJobCostCents)} />
          <Metric label="YTD overhead" value={money(report.expenseSummary.ytdOverheadCents)} />
          <Metric label="This month expenses" value={money(report.expenseSummary.monthExpenseCents)} />
          <Metric label="Pending payback" value={money(report.expenseSummary.pendingReimbursementCents)} />
          <Metric label="Receipts needing review" value={report.expenseSummary.receiptsNeedReview} />
          <Metric label="Receipt proof saved" value={report.expenseSummary.receiptProofCount} />
        </div>
        <div className="grid section-actions">
          <section className="panel span-12 subtle-panel">
            <h3>Expense categories this year</h3>
            <p className="muted">The P&amp;L is a management report, not a filed tax return. Confirm categories, accounting basis, owner draws, payroll, depreciation, and deductible treatment with your bookkeeper or tax professional.</p>
            <ul className="list">
              {report.expenseCategories.map((category) => (
                <li className="list-row" key={category.category}>
                  <div>
                    <strong>{category.category}</strong>
                    <span className="muted">{category.count} receipt or expense record{category.count === 1 ? "" : "s"} / tax {money(category.taxCents)}</span>
                  </div>
                  <span className="pill">{money(category.totalCents)}</span>
                </li>
              ))}
              {report.expenseCategories.length === 0 ? (
                <li className="list-row">
                  <span className="muted">No reviewed expense categories yet. Add receipts or field costs to start the P&L trail.</span>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>What needs your attention</h2>
            <p className="muted">Only decisions, missing connections, uncertain items, and customer or team issues that still need judgment.</p>
          </div>
          <Link className="button secondary-button" href="/app/owner-command-center">View all</Link>
        </div>
        <ul className="list">
          {ownerNeeds.slice(0, 6).map((need) => (
            <OwnerNeedRow key={need.id} need={need} />
          ))}
          {ownerNeeds.length === 0 ? <li className="list-row"><span className="muted">No owner blockers found right now.</span></li> : null}
        </ul>
      </section>

      <details className="panel section-actions">
        <summary>More reports and diagnostics</summary>
        <p className="muted">Channel, sales, connection, event, and troubleshooting detail when you need to investigate beyond the summary.</p>

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
                <h3>Connect missing accounts</h3>
                <p className="muted">{report.providerGaps.length} missing connections are keeping some work manual or review-only.</p>
              </div>
              <Link className="mini-button" href="/app/integrations">Connect</Link>
            </li>
            <li className="list-row">
              <div>
                <h3>Protect spend and tokens</h3>
                <p className="muted">Review AI, app alerts, email, publishing, and ads limits before turning on live actions.</p>
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
          <h2>Missing connections</h2>
          <p className="muted">Accounts that must be connected before Ferocity can carry the related work through.</p>
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
      </details>
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

function formatPct(value: number | null) {
  if (value === null) return "";
  return ` / ${value >= 0 ? "+" : ""}${value}%`;
}

function formatDelta(value: number, pct: number | null) {
  return `${value >= 0 ? "+" : ""}${value}${formatPct(pct)}`;
}

function priorityClass(priority: string) {
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "";
}

function OwnerNeedRow({ need }: { need: OwnerNeed }) {
  return (
    <li className="list-row">
      <div>
        <h3>{need.title}</h3>
        <p className="muted">{need.detail}</p>
      </div>
      <div className="inline-actions">
        <span className={`pill ${priorityClass(need.priority)}`}>{need.priority}</span>
        <span className="pill">{need.category}</span>
        <Link className="mini-button" href={need.href}>{need.actionLabel}</Link>
      </div>
    </li>
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
