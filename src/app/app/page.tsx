import Link from "next/link";
import type React from "react";
import {
  AlertTriangle,
  BellRing,
  Bot,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DollarSign,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow
} from "lucide-react";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getServiceControls, type ServiceControl } from "@/lib/controls/get-service-controls";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";

function dateLabel(value: string | null) {
  if (!value) return "Due now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Due now";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function numberLabel(value: number) {
  return value.toLocaleString();
}

function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function hours(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function controlTone(control: ServiceControl) {
  if (!control.planAllowed || control.mode === "off") return "high";
  if (control.mode === "review_required" || control.mode === "draft_only") return "medium";
  return "";
}

function readableStatus(value: string) {
  return value.replaceAll("_", " ");
}

export default async function AppDashboardPage() {
  const [snapshot, controls, reporting, billing] = await Promise.all([
    getDashboardSnapshot(),
    getServiceControls(),
    getReportingDashboard(),
    getBillingOverview()
  ]);

  const ownerSummary = snapshot.operator.ownerSummary;
  const topAttention = snapshot.todayPlan.slice(0, 4);
  const firstMove = topAttention[0] ?? {
    title: "Tell Ferocity what to set up first",
    detail: "Choose where AI should help first: leads, follow-up, jobs, money, reviews, growth, or team reminders.",
    href: "/app/ai-workforce",
    buttonLabel: "Open AI Workforce",
    urgency: "medium"
  };
  const followUps = snapshot.operator.followUps.slice(0, 3);
  const invoiceFollowUps = snapshot.operator.invoiceFollowUps.slice(0, 3);
  const setupBlockers = controls.controls
    .filter((control) => !control.planAllowed || control.mode === "off" || control.mode === "review_required" || control.mode === "draft_only")
    .slice(0, 5);
  const activeTools = controls.controls.filter((control) => control.planAllowed && control.mode !== "off").slice(0, 6);
  const roiRows = reporting.channelRoi.slice(0, 3);
  const planName = billing.subscription?.planKey ? billing.subscription.planKey.replaceAll("_", " ") : "not set";
  const commandMetrics = [
    { label: "New leads", value: snapshot.metrics.openLeads, note: `${snapshot.metrics.followUpsDue} follow-up${snapshot.metrics.followUpsDue === 1 ? "" : "s"} due`, tone: "hot" },
    { label: "Pipeline", value: snapshot.metrics.pipelineValue, note: "open value", tone: "money" },
    { label: "Money owed", value: snapshot.metrics.invoiceBalance, note: `${snapshot.metrics.unpaidInvoices} invoice${snapshot.metrics.unpaidInvoices === 1 ? "" : "s"} unpaid`, tone: "trust" },
    { label: "Team today", value: ownerSummary.scheduledToday, note: `${ownerSummary.itineraryNeeded} need plan`, tone: "draft" }
  ];
  const commandActions = [
    `${snapshot.metrics.followUpsDue} follow-up${snapshot.metrics.followUpsDue === 1 ? "" : "s"} need attention.`,
    `${snapshot.metrics.openLeads} open lead${snapshot.metrics.openLeads === 1 ? "" : "s"} need a fast response.`,
    `${snapshot.metrics.unpaidInvoices} unpaid invoice${snapshot.metrics.unpaidInvoices === 1 ? "" : "s"} need collection visibility.`,
    `${ownerSummary.itineraryNeeded} worker${ownerSummary.itineraryNeeded === 1 ? "" : "s"} may still need a day plan.`,
    `${snapshot.metrics.actionQueue} AI-prepared action${snapshot.metrics.actionQueue === 1 ? "" : "s"} are waiting for review.`,
    roiRows[0] ? `${roiRows[0].label} is the top tracked growth source right now.` : "Connect website, forms, campaigns, and sources to see what creates booked work."
  ];
  const workingSignals = [
    {
      label: "Watching leads",
      detail: snapshot.metrics.openLeads ? `${snapshot.metrics.openLeads} open lead${snapshot.metrics.openLeads === 1 ? "" : "s"} in view` : "No open leads waiting",
      href: "/app/lead-command"
    },
    {
      label: "Checking follow-up",
      detail: snapshot.metrics.followUpsDue ? `${snapshot.metrics.followUpsDue} follow-up${snapshot.metrics.followUpsDue === 1 ? "" : "s"} due` : "No follow-ups due right now",
      href: "/app/text-queue"
    },
    {
      label: "Watching money",
      detail: snapshot.metrics.unpaidInvoices ? `${snapshot.metrics.unpaidInvoices} unpaid invoice${snapshot.metrics.unpaidInvoices === 1 ? "" : "s"}` : "No unpaid invoice alerts",
      href: "/app/cash-collection"
    },
    {
      label: "Checking team",
      detail: ownerSummary.itineraryNeeded ? `${ownerSummary.itineraryNeeded} day plan${ownerSummary.itineraryNeeded === 1 ? "" : "s"} may be needed` : "Team plan looks quiet",
      href: "/app/crew-itinerary"
    },
    {
      label: "Reviewing AI work",
      detail: snapshot.metrics.actionQueue ? `${snapshot.metrics.actionQueue} prepared action${snapshot.metrics.actionQueue === 1 ? "" : "s"} waiting` : "No AI actions waiting",
      href: "/app/actions"
    }
  ];
  const commandPrompts = [
    ["What needs my attention today?", "/app/attention-command"],
    ["Follow up with unpaid customers", "/app/cash-collection"],
    ["Plan my workers for today", "/app/crew-itinerary"],
    ["Get me more leads this week", "/app/growth-calendar"],
    ["Set up my business for me", "/app/build-system"],
    ["Show every tool", "/app/feature-map"]
  ];
  const sourceRows =
    roiRows.length > 0
      ? roiRows.map((row) => [row.label, row.revenueCents > 0 ? moneyFromCents(row.revenueCents) : `${row.leads} lead${row.leads === 1 ? "" : "s"}`, row.roiLabel] as const)
      : [
          ["Website/forms", `${snapshot.metrics.openLeads} leads`, "needs tracking"] as const,
          ["Open pipeline", snapshot.metrics.pipelineValue, "active"] as const,
          ["Collected", snapshot.metrics.paymentsCollected, "recorded"] as const
        ];

  return (
    <main className="section-actions">
      <section className="panel">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Home</p>
            <h1>Here is what needs attention.</h1>
            <p className="muted">
              Ferocity watches the business and points to the next move.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/welcome">Start Here</Link>
            <Link className="button" href="/app/attention-command">Open Today</Link>
            <Link className="button secondary-button" href="/app/ai-workforce">AI Workforce</Link>
            <Link className="button secondary-button" href="/app/feature-map">All tools</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="operator-command-hero">
          <div>
            <p className="eyebrow">Business command bar</p>
            <h2>Tell Ferocity the outcome. It points you to the work.</h2>
            <p className="muted">
              Use this when you do not know which page to open. The AI Workforce prepares plans and routes you to the right existing tools.
            </p>
          </div>
          <Link className="operator-command-input large-command" href="/app/ai-workforce">
            <span>Example: who needs a follow-up, what money is waiting, or what should my crew do today?</span>
            <strong>Open AI Workforce</strong>
          </Link>
        </div>
        <div className="operator-command-chips">
          {commandPrompts.map(([label, href]) => (
            <Link href={href} key={label}>{label}</Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Ferocity is watching</p>
            <h2>Quiet monitoring, clear nudges.</h2>
            <p className="muted">These are live workspace checks from the current dashboard data. No fake sends, no fake automation claims.</p>
          </div>
          <Link className="mini-button" href="/app/automation-timeline">See activity</Link>
        </div>
        <div className="watch-grid">
          {workingSignals.map((signal) => (
            <Link className="watch-card" href={signal.href} key={signal.label}>
              <span />
              <strong>{signal.label}</strong>
              <small>{signal.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Simple path</p>
            <h2>Not sure what to do? Start here.</h2>
            <p className="muted">
              Ferocity can guide setup, but the basic manual tools stay one click away.
            </p>
          </div>
          <Link className="button" href="/app/build-system">Let Ferocity guide me</Link>
        </div>
        <div className="path-grid">
          {[
            ["1. Tell Ferocity the goal", "Use plain words. Ferocity recommends the next setup steps before changing anything.", "/app/build-system"],
            ["2. Add work manually", "Create customers, estimates, jobs, invoices, payments, field costs, workers, and reminders yourself.", "/app/service-command"],
            ["3. Connect lead sources", "Add website forms, public links, tracking, customer portals, proof links, and payment-link readiness.", "/app/customer-touchpoints"],
            ["4. Check today", "See hot leads, overdue follow-up, unpaid invoices, worker plans, and AI-prepared actions.", "/app/attention-command"]
          ].map(([title, detail, href]) => (
            <Link className="path-card" href={href} key={title}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="product-console section-actions" aria-label="Unified Ferocity command center">
        <div className="console-topbar">
          <div>
            <span className="eyebrow">Command center</span>
            <strong>{snapshot.tenantName}</strong>
          </div>
          <span className="live-pill">Private business account</span>
        </div>
        <div className="console-tabs" aria-label="Command center areas">
          {["Today", "AI Workforce", "Customers", "Jobs", "Money", "Growth"].map((tabName) => (
            <span className={tabName === "Today" ? "active" : ""} key={tabName}>{tabName}</span>
          ))}
        </div>
        <div className="preview-metrics console-metrics">
          {commandMetrics.map((card) => (
            <div className={`preview-metric tone-${card.tone}`} key={card.label}>
              <span>{card.label}</span>
              <strong>{typeof card.value === "number" ? numberLabel(card.value) : card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </div>
        <div className="console-main">
          <section className="console-panel">
            <div className="console-heading">
              <h2><BellRing size={18} /> Today</h2>
              <small>What to handle</small>
            </div>
            <ul className="action-stack">
              {commandActions.map((item) => (
                <li key={item}><span />{item}</li>
              ))}
            </ul>
          </section>
          <section className="console-panel">
            <div className="console-heading">
              <h2><Bot size={18} /> AI Workforce</h2>
              <small>Recommended next move</small>
            </div>
            <div className="recommend-card">
              <strong>{firstMove.title}</strong>
              <p>{firstMove.detail}</p>
              <Link href={firstMove.href}>{firstMove.buttonLabel}</Link>
            </div>
          </section>
        </div>
        <div className="console-pipeline">
          <div className="console-heading">
            <h2><ChartNoAxesCombined size={18} /> Source to revenue</h2>
            <small>What is creating work</small>
          </div>
          {sourceRows.map(([name, value, priority]) => (
            <div className="pipeline-row" key={name}>
              <strong>{name}</strong>
              <span>{value}</span>
              <i className={priority.includes("Needs") || priority.includes("needs") ? "bar-medium" : "bar-high"} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Next best action</p>
              <h2>{firstMove.title}</h2>
              <p className="muted">{firstMove.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${firstMove.urgency === "high" ? "high" : firstMove.urgency === "medium" ? "medium" : ""}`}>
                {firstMove.urgency}
              </span>
              <Link className="button" href={firstMove.href}>{firstMove.buttonLabel}</Link>
            </div>
          </div>
        </section>

        <section className="panel span-3 metric">
          <CircleDollarSign size={18} />
          <span className="muted">Money radar</span>
          <strong>{snapshot.metrics.invoiceBalance}</strong>
          <span className="muted">{snapshot.metrics.unpaidInvoices} unpaid invoice{snapshot.metrics.unpaidInvoices === 1 ? "" : "s"}</span>
        </section>

        <section className="panel span-3 metric">
          <ShieldCheck size={18} />
          <span className="muted">Current plan</span>
          <strong>{planName}</strong>
          <span className="muted">{controls.summary.reviewRequired} tools require review before use</span>
        </section>
      </section>

      <section className="grid section-actions">
        <Metric label="Open leads" value={snapshot.metrics.openLeads} detail="New requests to review" href="/app/lead-command" icon={<BriefcaseBusiness size={16} />} tone={snapshot.metrics.openLeads ? "medium" : ""} />
        <Metric label="Follow-ups due" value={snapshot.metrics.followUpsDue} detail="Leads, estimates, callbacks, invoices" href="/app/attention-command" icon={<Clock3 size={16} />} tone={snapshot.metrics.followUpsDue ? "high" : ""} />
        <Metric label="Open pipeline" value={snapshot.metrics.pipelineValue} detail="Potential revenue still moving" href="/app/lead-command" icon={<DollarSign size={16} />} />
        <Metric label="Collected" value={snapshot.metrics.paymentsCollected} detail="Payments recorded" href="/app/cash-collection" icon={<CircleDollarSign size={16} />} />
        <Metric label="People scheduled" value={ownerSummary.scheduledToday} detail="Assignments today" href="/app/operations-workforce" icon={<Users size={16} />} tone={ownerSummary.scheduledToday ? "" : "medium"} />
        <Metric label="Need itinerary" value={ownerSummary.itineraryNeeded} detail="Workers with no day plan" href="/app/crew-itinerary" icon={<AlertTriangle size={16} />} tone={ownerSummary.itineraryNeeded ? "high" : ""} />
        <Metric label="Field review" value={ownerSummary.expenseReview} detail="Costs, mileage, materials" href="/app/operations-workforce#field-work" icon={<CheckCircle2 size={16} />} tone={ownerSummary.expenseReview ? "medium" : ""} />
        <Metric label="AI review queue" value={snapshot.metrics.actionQueue} detail="Prepared actions waiting" href="/app/actions" icon={<Bot size={16} />} tone={snapshot.metrics.actionQueue ? "medium" : ""} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Owner briefing</p>
              <h2>What Ferocity found today</h2>
              <p className="muted">This is the short list. The full command center keeps the detailed event feed.</p>
            </div>
            <Link className="mini-button" href="/app/owner-command-center">Full feed</Link>
          </div>
          <ul className="list">
            {topAttention.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${item.urgency === "high" ? "high" : item.urgency === "medium" ? "medium" : ""}`}>{item.urgency}</span>
                  <Link className="mini-button" href={item.href}>{item.buttonLabel}</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">AI Workforce</p>
              <h2>Tell Ferocity what outcome you want.</h2>
              <p className="muted">
                Use normal words. Ferocity shows the plan before anything important happens.
              </p>
            </div>
              <Link className="button" href="/app/ai-workforce">Open AI Workforce</Link>
          </div>
          <div className="grid section-actions">
            <ToolLink href="/app/business-brain" title="Business Info" detail="Services, prices, team, territory, voice, policies, and source of truth." />
            <ToolLink href="/app/build-system" title="Build My System" detail="Guided setup for workflows, reviews, marketing, follow-up, and controls." />
            <ToolLink href="/app/automation-timeline" title="Automation Timeline" detail="See what AI prepared, what was approved, what ran, and what failed." />
            <ToolLink href="/app/autopilot" title="Autopilot" detail="Choose what AI can handle, what needs review, and what stays manual." />
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <ListPanel title="Follow-up queue" actionHref="/app/text-queue" actionLabel="Open follow-ups" empty="No follow-ups due right now.">
          {followUps.map((item) => (
            <li className="list-row" key={item.id}>
              <div>
                <h3>{item.contactName}</h3>
                <p className="muted">{readableStatus(item.workflowType)} by {item.channel}</p>
                <p>{item.suggestedMessage ?? "No draft message yet."}</p>
              </div>
              <span className="pill">{dateLabel(item.dueAt)}</span>
            </li>
          ))}
        </ListPanel>

        <ListPanel title="Cash collection" actionHref="/app/cash-collection" actionLabel="Open money" empty="No invoice follow-ups are waiting.">
          {invoiceFollowUps.map((invoice) => (
            <li className="list-row" key={invoice.id}>
              <div>
                <h3>{invoice.customerName}</h3>
                <p className="muted">{invoice.title}</p>
                <p>{invoice.balanceDue} due {dateLabel(invoice.dueDate)}</p>
              </div>
              <span className="pill medium">{readableStatus(invoice.status)}</span>
            </li>
          ))}
        </ListPanel>
      </section>

      <section className="grid section-actions">
        <section className="panel span-4">
          <p className="eyebrow">People</p>
          <h2>Today&apos;s team picture</h2>
          <ul className="list">
            <li className="list-row"><span>Working now</span><strong>{numberLabel(ownerSummary.workingNow)}</strong></li>
            <li className="list-row"><span>Hours today</span><strong>{hours(ownerSummary.hoursToday)}</strong></li>
            <li className="list-row"><span>Open assignments</span><strong>{numberLabel(ownerSummary.openAssignments)}</strong></li>
            <li className="list-row"><span>Payroll review</span><strong>{numberLabel(ownerSummary.payrollReview)}</strong></li>
          </ul>
          <div className="section-actions">
            <Link className="button secondary-button" href="/app/operations-workforce">Manage people</Link>
          </div>
        </section>

        <section className="panel span-4">
          <p className="eyebrow">Growth</p>
          <h2>What is producing work</h2>
          <ul className="list">
            {roiRows.length > 0 ? (
              roiRows.map((row) => (
                <li className="list-row" key={row.label}>
                  <div>
                    <h3>{row.label}</h3>
                    <p className="muted">{row.leads} leads, {row.jobs} jobs</p>
                  </div>
                  <span className="pill">{row.roiLabel}</span>
                </li>
              ))
            ) : (
              <li className="list-row">
                <span className="muted">Connect forms, campaigns, or website tracking to see which sources create jobs.</span>
              </li>
            )}
          </ul>
          <div className="section-actions">
            <Link className="button secondary-button" href="/app/growth-calendar">Open growth</Link>
          </div>
        </section>

        <section className="panel span-4">
          <p className="eyebrow">Setup</p>
          <h2>What is gated or needs review</h2>
          <ul className="list">
            {setupBlockers.length > 0 ? (
              setupBlockers.map((control) => (
                <li className="list-row" key={control.featureKey}>
                  <div>
                    <h3>{control.label}</h3>
                    <p className="muted">{control.planRule}</p>
                  </div>
                  <span className={`pill ${controlTone(control)}`}>{readableStatus(control.mode)}</span>
                </li>
              ))
            ) : (
              <li className="list-row">
                <span className="muted">No setup blockers found for this business.</span>
              </li>
            )}
          </ul>
          <div className="section-actions">
            <Link className="button secondary-button" href="/app/controls">Open controls</Link>
          </div>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Traditional mode</p>
            <h2>Use the full toolset when you want control.</h2>
            <p className="muted">AI Workforce is the front door. Direct tools stay available when someone wants full control.</p>
          </div>
          <Link className="button secondary-button" href="/app/feature-map">Open feature map</Link>
        </div>
        <div className="grid section-actions">
          <ToolLink href="/app/lead-command" title="Customers" detail="Leads, conversations, follow-up, pipeline, and customer records." />
          <ToolLink href="/app/service-command" title="Jobs" detail="Jobs, estimates, invoices, reviews, scheduling, and daily service ops." />
          <ToolLink href="/app/operations-workforce" title="People" detail="Workers, itineraries, time, field costs, payroll review, and staffing needs." />
          <ToolLink href="/app/cash-collection" title="Money" detail="Invoices, payments, reminders, recurring expenses, job cost, and owner review." />
          <ToolLink href="/app/growth-calendar" title="Growth" detail="SEO, reviews, campaigns, content drafts, website tracking, and attribution." />
          <ToolLink href="/app/reports" title="Insights" detail="Reports, ROI, channel performance, risks, and revenue movement." />
          <ToolLink href="/app/settings" title="Settings" detail="Workspace, users, brands, connected tools, billing, and controls." />
          <ToolLink href="/app/automation-command" title="Automation Rules" detail="Rules, action queue, approvals, connected tools, and limits." />
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Active services</p>
            <h2>What Ferocity is ready to help with</h2>
            <p className="muted">These are tools the current plan allows and that are switched on.</p>
          </div>
          <Link className="mini-button" href="/app/controls">Change controls</Link>
        </div>
        <div className="grid section-actions">
          {activeTools.map((control) => (
            <section className="panel span-4" key={control.featureKey}>
              <Sparkles size={16} />
              <h3>{control.label}</h3>
              <p className="muted">{control.plainRule}</p>
              <span className={`pill ${control.mode === "enabled" ? "" : "medium"}`}>{readableStatus(control.mode)}</span>
            </section>
          ))}
          {activeTools.length === 0 ? (
            <section className="panel span-12">
              <p className="muted">No active services found yet. Start with AI Workforce or Controls to turn on the first workflow.</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  href,
  tone = ""
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  href: string;
  tone?: string;
}) {
  return (
    <Link className="panel span-3 metric" href={href}>
      <span className={`pill ${tone}`}>{icon}{label}</span>
      <strong>{typeof value === "number" ? numberLabel(value) : value}</strong>
      <span className="muted">{detail}</span>
    </Link>
  );
}

function ListPanel({
  title,
  actionHref,
  actionLabel,
  empty,
  children
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  empty: string;
  children: React.ReactNode[];
}) {
  const rows = children.filter(Boolean);
  return (
    <section className="panel span-6">
      <div className="list-row flush-row">
        <div>
          <p className="eyebrow">Queue</p>
          <h2>{title}</h2>
        </div>
        <Link className="mini-button" href={actionHref}>{actionLabel}</Link>
      </div>
      <ul className="list">
        {rows.length > 0 ? rows : (
          <li className="list-row">
            <span className="muted">{empty}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function ToolLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link className="panel span-3 metric" href={href}>
      <Workflow size={16} />
      <strong>{title}</strong>
      <span className="muted">{detail}</span>
    </Link>
  );
}

