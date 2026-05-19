import Link from "next/link";
import { BarChart3, Building2, CalendarDays, FileCheck2, Inbox, Lightbulb, ShieldCheck, Sparkles } from "lucide-react";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";

export default async function AppDashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Workspace Home</p>
            <h1>{snapshot.tenantName}</h1>
            <p className="muted">Workspace command center for brands, leads, AI marketing plans, drafts, recommendations, and approvals.</p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/tenants">
              Organizations
            </Link>
            <Link className="button secondary-button" href="/app/brands">
              Brands
            </Link>
            <Link className="button" href="/app/leads">
              Leads
            </Link>
            <Link className="button secondary-button" href="/app/forms">
              Forms
            </Link>
            <Link className="button secondary-button" href="/app/access">
              Access
            </Link>
            <Link className="button secondary-button" href="/app/onboarding">
              Onboarding
            </Link>
            <Link className="button" href="/app/marketing">
              <Sparkles size={16} /> AI Operator
            </Link>
          </div>
        </div>

        <div className="grid">
          <Metric icon={<Building2 size={20} />} label="Brands" value={snapshot.metrics.brands} />
          <Metric icon={<Inbox size={20} />} label="Open Leads" value={snapshot.metrics.openLeads} />
          <Metric icon={<FileCheck2 size={20} />} label="Drafts" value={snapshot.metrics.pendingDrafts} />
          <Metric icon={<ShieldCheck size={20} />} label="Approvals" value={snapshot.metrics.pendingApprovals} />
          <Metric icon={<CalendarDays size={20} />} label="Content This Week" value={snapshot.metrics.contentCreatedThisWeek} />
          <Metric icon={<Lightbulb size={20} />} label="AI Recommendations" value={snapshot.metrics.aiRecommendations} />
          <Metric icon={<BarChart3 size={20} />} label="Stale Leads" value={snapshot.metrics.staleLeads} />
        </div>

        <div className="grid">
          <section className="panel span-6">
            <h2>Brands</h2>
            <ul className="list">
              {snapshot.brands.map((brand) => (
                <li className="list-row" key={brand.slug}>
                  <div>
                    <h3>{brand.name}</h3>
                    <p className="muted">{brand.industry}</p>
                  </div>
                  <span className="pill">{brand.businessModel}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel span-6">
            <h2>Recommendations</h2>
            <ul className="list">
              {snapshot.recommendations.map((item) => (
                <li className="list-row" key={item.title}>
                  <div>
                    <h3>{item.title}</h3>
                    <p className="muted">{item.summary}</p>
                  </div>
                  <span className={`pill ${item.riskLevel}`}>{item.riskLevel}</span>
                </li>
              ))}
            </ul>
          </section>

          <Breakdown title="Leads by Brand" rows={snapshot.reporting.leadsByBrand} />
          <Breakdown title="Leads by Source" rows={snapshot.reporting.leadsBySource} />
          <Breakdown title="Leads by Campaign" rows={snapshot.reporting.leadsByCampaign} />

          <section className="panel span-12">
            <h2>
              <Lightbulb size={18} /> AI Task Queue
            </h2>
            <div className="button-row section-actions">
              <Link className="button secondary-button" href="/app/tasks">
                Tasks
              </Link>
              <Link className="button secondary-button" href="/app/drafts">
                Drafts
              </Link>
              <Link className="button secondary-button" href="/app/recommendations">
                Recommendations
              </Link>
              <Link className="button secondary-button" href="/app/approvals">
                Approvals
              </Link>
              <Link className="button secondary-button" href="/app/calendar">
                Calendar
              </Link>
              <Link className="button secondary-button" href="/app/review">
                Review
              </Link>
              <Link className="button secondary-button" href="/app/exports">
                Exports
              </Link>
            <Link className="button secondary-button" href="/app/reports">
              Reports
            </Link>
            <Link className="button secondary-button" href="/app/workflows">
              Workflows
            </Link>
            <Link className="button secondary-button" href="/app/integrations">
              Integrations
            </Link>
            <Link className="button secondary-button" href="/app/settings">
              Settings
            </Link>
            <Link className="button secondary-button" href="/app/qa">
              QA
            </Link>
            <Link className="button secondary-button" href="/app/safety">
              Safety
            </Link>
          </div>
            <ul className="list">
              {snapshot.tasks.map((task) => (
                <li className="list-row" key={task.title}>
                  <div>
                    <h3>{task.title}</h3>
                    <p className="muted">{task.type}</p>
                  </div>
                  <span className="pill">{task.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      {icon}
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
        {rows.length === 0 ? (
          <li className="list-row">
            <span className="muted">No lead data yet</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
