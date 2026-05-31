import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Inbox,
  Lightbulb,
  MousePointerClick,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow
} from "lucide-react";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getServiceControls } from "@/lib/controls/get-service-controls";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { scanActionQueueAction } from "./actions/actions";
import { scanGrowthLoopAction } from "./growth/actions";

function dateLabel(value: string | null) {
  if (!value) return "Due now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function AppDashboardPage() {
  const [snapshot, controls, reporting, billing] = await Promise.all([
    getDashboardSnapshot(),
    getServiceControls(),
    getReportingDashboard(),
    getBillingOverview()
  ]);
  const watchedControls = controls.controls.filter((control) => control.costed || control.publicFacing);
  const tightControls = watchedControls.filter(
    (control) => control.usageLimit !== null && control.remaining !== null && control.remaining <= Math.max(5, control.usageLimit * 0.1)
  );
  const growthRows = reporting.channelRoi.length > 0 ? reporting.channelRoi.slice(0, 5) : [];
  const currentPlan = billing.subscription?.planKey ?? "not set";
  const controlByKey = new Map(controls.controls.map((control) => [control.featureKey, control]));
  const activeSnapshot = [
    {
      label: "Lead capture",
      detail: "Forms and lead records",
      href: "/app/forms",
      status: snapshot.metrics.openLeads > 0 ? "included" : "needs_setup"
    },
    {
      label: "SEO drafts",
      detail: "Service pages and refresh ideas",
      href: "/app/seo",
      status: controlByKey.get("seo_autopilot")?.mode === "draft_only" ? "draft_only" : "needs_setup"
    },
    {
      label: "Review requests",
      detail: "Draft requests after completed work",
      href: "/app/review",
      status: controlByKey.get("review_requests")?.mode === "review_required" ? "needs_approval" : "needs_setup"
    },
    {
      label: "Follow-up reminders",
      detail: "Stale leads, estimates, invoices",
      href: "/app/operator",
      status: controlByKey.get("follow_up_recovery") ? "included" : "needs_setup"
    },
    {
      label: "Email/SMS sending",
      detail: "Disabled until providers and consent are ready",
      href: "/app/integrations",
      status: "provider_key"
    },
    {
      label: "MarketplacePro sync",
      detail: "Optional bridge, not live until connected",
      href: "/app/integrations",
      status: "provider_key"
    }
  ];

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
            <Link className="button secondary-button" href="/app/website">
              Connect Website
            </Link>
            <Link className="button" href="/app/build-system">
              Build My System
            </Link>
            <Link className="button" href="/app/go-live">
              Go Live Check
            </Link>
            <Link className="button secondary-button" href="/app/system-health">
              System Health
            </Link>
            <Link className="button secondary-button" href="/app/sample-tour">
              Sample Tour
            </Link>
            <Link className="button secondary-button" href="/app/setup">
              Setup
            </Link>
          </div>
        </div>

        <section className="clarity-band">
          <div className="panel">
            <div className="list-row flush-row">
              <div>
                <h2>What Ferocity Runs</h2>
                <p className="muted">One growth and operations loop for getting found, capturing demand, following up, and learning what makes money.</p>
              </div>
              <span className="pill">review-first</span>
            </div>
            <div className="operating-loop">
              <div className="loop-step">
                <Search size={18} />
                <strong>Get found</strong>
                <p>SEO drafts, service pages, city pages, GBP ideas, reviews, offers, and campaigns help create more qualified demand.</p>
              </div>
              <div className="loop-step">
                <Inbox size={18} />
                <strong>Catch the lead</strong>
                <p>Forms, marketplace leads, calls, texts, and website requests become tracked work instead of loose inbox noise.</p>
              </div>
              <div className="loop-step">
                <MousePointerClick size={18} />
                <strong>Follow up fast</strong>
                <p>Ferocity finds stale leads, ignored estimates, missed callbacks, and unpaid invoices before they go cold.</p>
              </div>
              <div className="loop-step">
                <BarChart3 size={18} />
                <strong>Grow what works</strong>
                <p>Ferocity connects pages, campaigns, leads, jobs, reviews, invoices, and revenue so the next move is based on proof.</p>
              </div>
            </div>
          </div>

          <aside className="panel">
            <h2>Start Here</h2>
            <ul className="start-list">
              <li>
                <span className="step-dot">1</span>
                <div>
                  <strong>Add your business</strong>
                  <p className="muted">Name, services, service areas, phone, email, and brand basics.</p>
                </div>
                <Link className="mini-button" href="/app/setup">Start</Link>
              </li>
              <li>
                <span className="step-dot">2</span>
                <div>
                  <strong>Choose what Ferocity handles</strong>
                  <p className="muted">Leads, SEO, reviews, automations, jobs, invoices, or all of it.</p>
                </div>
                <Link className="mini-button" href="/app/build-system">Choose</Link>
              </li>
              <li>
                <span className="step-dot">3</span>
                <div>
                  <strong>Connect lead sources</strong>
                  <p className="muted">Forms, website, MarketplacePro, calls, email, ads, or manual entry.</p>
                </div>
                <Link className="mini-button" href="/app/integrations">Connect</Link>
              </li>
              <li>
                <span className="step-dot">4</span>
                <div>
                  <strong>Set follow-up rules</strong>
                  <p className="muted">Stale leads, missed callbacks, estimates, invoices, and reviews.</p>
                </div>
                <Link className="mini-button" href="/app/automation">Rules</Link>
              </li>
              <li>
                <span className="step-dot">5</span>
                <div>
                  <strong>Review automations</strong>
                  <p className="muted">Make sure messages, drafts, and approvals match how you work.</p>
                </div>
                <Link className="mini-button" href="/app/controls">Review</Link>
              </li>
              <li>
                <span className="step-dot">6</span>
                <div>
                  <strong>Go live when ready</strong>
                  <p className="muted">Connect providers, set limits, and approve live sending or publishing.</p>
                </div>
                <Link className="mini-button" href="/app/integrations">Go live</Link>
              </li>
            </ul>
          </aside>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>What Is Active?</h2>
              <p className="muted">A plain status check for the main parts of Ferocity. These are setup states, not hidden API chores.</p>
            </div>
            <Link className="mini-button" href="/app/build-system">
              Build this for me
            </Link>
          </div>
          <div className="status-grid">
            {activeSnapshot.map((item) => (
              <Link className="status-card" href={item.href} key={item.label}>
                <div>
                  <h3>{item.label}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <StatusBadge status={item.status} />
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>
                <Workflow size={18} /> Pick Your Starting Point
              </h2>
              <p className="muted">Ferocity can start as a growth system, an automation system, or both. A business does not have to use every module.</p>
            </div>
            <Link className="mini-button" href="/app/setup">Choose modules</Link>
          </div>
          <div className="path-grid">
            <Link className="path-card" href="/app/build-system">
              <Sparkles size={18} />
              <strong>I do not know how to set this up</strong>
              <span>Describe the business in plain English and let Ferocity create a reviewed setup plan.</span>
            </Link>
            <Link className="path-card" href="/app/sample-tour">
              <CalendarDays size={18} />
              <strong>I want to see an example first</strong>
              <span>Open a private sample tour with leads, follow-ups, estimates, reviews, automation, and ROI without touching real data.</span>
            </Link>
            <Link className="path-card" href="/app/growth">
              <Search size={18} />
              <strong>I want more leads</strong>
              <span>SEO drafts, city/service pages, GBP ideas, reviews, campaigns, forms, and attribution.</span>
            </Link>
            <Link className="path-card" href="/app/automation">
              <Workflow size={18} />
              <strong>I want automations</strong>
              <span>Lead follow-up, estimate reminders, invoice nudges, review requests, callbacks, and approval queues.</span>
            </Link>
            <Link className="path-card" href="/app/operator">
              <MousePointerClick size={18} />
              <strong>I want daily operations</strong>
              <span>One console for what needs attention today, without making the owner hunt through every tool.</span>
            </Link>
            <Link className="path-card" href="/app/go-live">
              <ShieldCheck size={18} />
              <strong>I want to know if we are ready</strong>
              <span>Run a read-only launch scan for basics, providers, approvals, limits, and public/private safety.</span>
            </Link>
            <Link className="path-card" href="/app/system-health">
              <PlugZap size={18} />
              <strong>I want to see what is broken</strong>
              <span>Check missing setup, broken forms, stale follow-ups, provider gaps, and intentionally paused systems.</span>
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>What You Can Use</h2>
              <p className="muted">Ferocity is useful before every outside tool is connected. Provider features stay controlled because email, SMS, AI, hosting, and billing can cost money.</p>
            </div>
            <div className="inline-actions">
              <span className="pill">Plan: {currentPlan}</span>
              <Link className="mini-button" href="/app/billing">Tiers</Link>
            </div>
          </div>
          <div className="service-explainer-grid">
            <section>
              <h3>
                <CheckCircle2 size={16} /> Included Workspace Tools
              </h3>
              <p className="muted">Use these to organize the business now.</p>
              <ul className="plain-list">
                <li>Leads, customers, notes, and timelines</li>
                <li>Jobs, estimates, invoices, callbacks, and follow-up lists</li>
                <li>SEO drafts, hosted page drafts, review workflows, reports, and operator insights</li>
              </ul>
              <Link className="mini-button" href="/app/setup">Set up basics</Link>
            </section>
            <section>
              <h3>
                <PlugZap size={16} /> Connect When Ready
              </h3>
              <p className="muted">These need keys, domains, accounts, or approval rules.</p>
              <ul className="plain-list">
                <li>Resend for email sending after domain verification</li>
                <li>Twilio for SMS after number, consent, and compliance setup</li>
                <li>Stripe, calendars, GBP, analytics, ads, Search Console, CMS, and MarketplacePro</li>
              </ul>
              <Link className="mini-button" href="/app/integrations">See connections</Link>
            </section>
            <section>
              <h3>
                <ShieldCheck size={16} /> Paid Or Limited Work
              </h3>
              <p className="muted">These stay off, draft-only, or review-required until limits and tiers are clear.</p>
              <ul className="plain-list">
                <li>AI generation, hosted pages, email, SMS, review requests, calendar sync, and external publishing</li>
                <li>Monthly limits and overage rules protect the workspace from surprise costs</li>
                <li>Public publishing and customer messages should pass review first</li>
              </ul>
              <Link className="mini-button" href="/app/controls">Control limits</Link>
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Today</h2>
              <p className="muted">The shortest path from attention to revenue. No setup language, no API chores.</p>
            </div>
            <Link className="mini-button" href="/app/operator">
              Full console
            </Link>
          </div>
          <ul className="priority-list">
            {snapshot.todayPlan.map((item, index) => (
              <li className="priority-row" key={item.id}>
                <span className="priority-number">{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <span className={`pill ${item.urgency}`}>{item.urgency}</span>
                <Link className="mini-button" href={item.href}>
                  {item.buttonLabel}
                </Link>
              </li>
            ))}
          </ul>
        </section>

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
          <section className="panel span-8">
            <div className="list-row flush-row">
              <div>
                <h2>Growth To Money</h2>
                <p className="muted">Connect marketing work to real leads, jobs, spend, and collected revenue.</p>
              </div>
              <Link className="mini-button" href="/app/reports">
                Reports
              </Link>
            </div>
            <ul className="list">
              {growthRows.map((row) => (
                <li className="list-row" key={row.label}>
                  <div>
                    <h3>{row.label}</h3>
                    <p className="muted">
                      {row.leads.toLocaleString()} leads / {row.jobs.toLocaleString()} jobs / {money(row.revenueCents)} revenue / {money(row.spendCents)} spend
                    </p>
                  </div>
                  <span className="pill">{row.roiLabel}</span>
                </li>
              ))}
              {growthRows.length === 0 ? (
                <li className="list-row">
                  <span className="muted">No closed-loop marketing data yet. Connect sources, forms, jobs, invoices, and spend before trusting ROI.</span>
                </li>
              ) : null}
            </ul>
          </section>

          <section className="panel span-4">
            <div className="list-row flush-row">
              <div>
                <h2>Controls & Limits</h2>
                <p className="muted">Costed or public-facing services that can spend money or publish/send externally.</p>
              </div>
              <Link className="mini-button" href="/app/controls">
                Controls
              </Link>
            </div>
            <ul className="list">
              <li className="list-row">
                <strong>Needs review</strong>
                <span className="pill">{controls.summary.reviewRequired}</span>
              </li>
              <li className="list-row">
                <strong>Draft only</strong>
                <span className="pill">{controls.summary.draftOnly}</span>
              </li>
              <li className="list-row">
                <strong>Near limits</strong>
                <span className={`pill ${tightControls.length ? "high" : ""}`}>{tightControls.length}</span>
              </li>
              {watchedControls.slice(0, 3).map((control) => (
                <li className="list-row" key={control.featureKey}>
                  <div>
                    <h3>{control.label}</h3>
                    <p className="muted">
                      {control.usageLimit === null
                        ? `${control.currentUsage.toLocaleString()} used`
                        : `${control.currentUsage.toLocaleString()} used / ${control.remaining?.toLocaleString()} left`}
                    </p>
                  </div>
                  <StatusBadge status={control.mode === "review_required" ? "needs_approval" : control.mode === "draft_only" ? "draft_only" : "included"} />
                </li>
              ))}
            </ul>
          </section>

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
              <Link className="button secondary-button" href="/app/website">
                Website Connector
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

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    included: "Included",
    limited: "Limited",
    needs_setup: "Needs setup",
    provider_key: "Needs provider key",
    needs_approval: "Needs approval",
    draft_only: "Draft only",
    higher_plan: "Higher plan"
  };
  return <span className={`pill status-${status}`}>{labels[status] ?? status.replaceAll("_", " ")}</span>;
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

