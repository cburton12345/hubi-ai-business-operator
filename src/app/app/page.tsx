import Link from "next/link";
import { Building2, FileCheck2, Inbox, Lightbulb, ShieldCheck } from "lucide-react";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";

export default async function AppDashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Admin Workspace</p>
            <h1>{snapshot.tenantName}</h1>
            <p className="muted">Phase 1 command center for brands, leads, AI drafts, recommendations, and approvals.</p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/tenant/internal-portfolio">
              View Tenant
            </Link>
            <Link className="button secondary-button" href="/app/tenants">
              Tenants
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
          </div>
        </div>

        <div className="grid">
          <Metric icon={<Building2 size={20} />} label="Brands" value={snapshot.metrics.brands} />
          <Metric icon={<Inbox size={20} />} label="Open Leads" value={snapshot.metrics.openLeads} />
          <Metric icon={<FileCheck2 size={20} />} label="Drafts" value={snapshot.metrics.pendingDrafts} />
          <Metric icon={<ShieldCheck size={20} />} label="Approvals" value={snapshot.metrics.pendingApprovals} />
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
