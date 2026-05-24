import Link from "next/link";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Inbox,
  Lightbulb,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { scanActionQueueAction } from "./actions/actions";
import { scanGrowthLoopAction } from "./growth/actions";

function dateLabel(value: string | null) {
  if (!value) return "Due now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AppDashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Workspace Home</p>
            <h1>{snapshot.tenantName}</h1>
            <p className="muted">Plain view of what needs attention, what is making money, and what Ferocity can help with next.</p>
          </div>
          <div className="button-row">
            <form action={scanGrowthLoopAction}>
              <button className="button" type="submit">
                <RefreshCw size={16} /> Find follow-ups
              </button>
            </form>
            <form action={scanActionQueueAction}>
              <button className="button secondary-button" type="submit">
                <CheckCircle2 size={16} /> Review actions
              </button>
            </form>
            <Link className="button" href="/app/operator">
              Operator Console
            </Link>
            <Link className="button secondary-button" href="/app/service">
              Service Ops
            </Link>
            <Link className="button" href="/app/growth">
              Growth Loop
            </Link>
            <Link className="button secondary-button" href="/app/setup">
              Setup
            </Link>
          </div>
        </div>

        <div className="grid">
          <Metric icon={<Inbox size={20} />} label="Open leads" value={snapshot.metrics.openLeads} href="/app/leads" />
          <Metric icon={<MousePointerClick size={20} />} label="Need follow-up" value={snapshot.metrics.followUpsDue} href="/app/growth" />
          <Metric icon={<CreditCard size={20} />} label="Unpaid invoices" value={snapshot.metrics.unpaidInvoices} href="/app/service" />
          <Metric icon={<ShieldCheck size={20} />} label="Actions to review" value={snapshot.metrics.actionQueue} href="/app/actions" />
          <Metric icon={<BarChart3 size={20} />} label="Pipeline" value={snapshot.metrics.pipelineValue} href="/app/operator" />
          <Metric icon={<CreditCard size={20} />} label="Payments made" value={snapshot.metrics.paymentsCollected} href="/app/service" />
          <Metric icon={<BarChart3 size={20} />} label="Visitors 30d" value={snapshot.metrics.visitors} href="/app/growth" />
          <Metric icon={<BarChart3 size={20} />} label="Ad spend 30d" value={snapshot.metrics.adSpend} href="/app/growth" />
        </div>

        <div className="grid">
          <section className="panel span-6">
            <div className="list-row flush-row">
              <div>
                <h2>Needs Follow-Up</h2>
                <p className="muted">Leads, invoices, estimates, and callbacks Ferocity found from real records.</p>
              </div>
              <Link className="mini-button" href="/app/growth">
                Follow up
              </Link>
            </div>
            <ul className="list">
              {snapshot.operator.followUps.map((item) => (
                <li className="list-row" key={item.id}>
                  <div>
                    <h3>{item.contactName}</h3>
                    <p className="muted">
                      {item.workflowType} / {item.channel} / {dateLabel(item.dueAt)}
                    </p>
                    {item.suggestedMessage ? <p>{item.suggestedMessage}</p> : null}
                  </div>
                  <Link className="mini-button" href="/app/growth">
                    Open
                  </Link>
                </li>
              ))}
              {snapshot.operator.followUps.length === 0 ? (
                <li className="list-row">
                  <span className="muted">No follow-ups due. Run a scan after new leads, invoices, jobs, or estimates change.</span>
                </li>
              ) : null}
            </ul>
          </section>

          <section className="panel span-6">
            <div className="list-row flush-row">
              <div>
                <h2>Invoice Follow-Up</h2>
                <p className="muted">Open balances that may need a polite payment reminder.</p>
              </div>
              <Link className="mini-button" href="/app/service">
                Invoices
              </Link>
            </div>
            <ul className="list">
              {snapshot.operator.invoiceFollowUps.map((invoice) => (
                <li className="list-row" key={invoice.id}>
                  <div>
                    <h3>{invoice.title}</h3>
                    <p className="muted">
                      {invoice.customerName} / {invoice.balanceDue} due / {invoice.dueDate ?? "No due date"}
                    </p>
                  </div>
                  <Link className="mini-button" href={`/app/service/invoices/${invoice.id}`}>
                    Open
                  </Link>
                </li>
              ))}
              {snapshot.operator.invoiceFollowUps.length === 0 ? (
                <li className="list-row">
                  <span className="muted">No unpaid invoice follow-ups right now.</span>
                </li>
              ) : null}
            </ul>
          </section>

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
              <Link className="button secondary-button" href="/app/leads">
                Leads
              </Link>
              <Link className="button secondary-button" href="/app/growth">
                Growth Loop
              </Link>
              <Link className="button secondary-button" href="/app/actions">
                Action Queue
              </Link>
              <Link className="button secondary-button" href="/app/service">
                Service Ops
              </Link>
              <Link className="button secondary-button" href="/app/seo">
                SEO Autopilot
              </Link>
              <Link className="button secondary-button" href="/app/marketing">
                <Sparkles size={16} /> AI Operator
              </Link>
              <Link className="button secondary-button" href="/app/drafts">
                Drafts
              </Link>
              <Link className="button secondary-button" href="/app/approvals">
                Approvals
              </Link>
              <Link className="button secondary-button" href="/app/operator">
                Operator Console
              </Link>
              <Link className="button secondary-button" href="/app/reports">
                Reports
              </Link>
              <Link className="button secondary-button" href="/app/alerts">
                Alerts
              </Link>
              <Link className="button secondary-button" href="/app/workflows">
                Workflows
              </Link>
              <Link className="button secondary-button" href="/app/integrations">
                Integrations
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

function Metric({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: React.ReactNode; href: string }) {
  return (
    <Link className="panel span-3 metric" href={href}>
      {icon}
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </Link>
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
