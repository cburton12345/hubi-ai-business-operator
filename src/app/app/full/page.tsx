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
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getServiceControls, type ServiceControl } from "@/lib/controls/get-service-controls";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getRecentAiCommandRuns } from "@/lib/ai-workforce/command-runs";
import { getAttentionCommandDashboard } from "@/lib/attention-command/get-attention-command-dashboard";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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

export default async function FullAppDashboardPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const [snapshot, controls, reporting, billing, recentCommands, attention] = await Promise.all([
    getDashboardSnapshot(),
    getServiceControls(),
    getReportingDashboard(),
    getBillingOverview(),
    getRecentAiCommandRuns(workspaceId, 4),
    getAttentionCommandDashboard()
  ]);

  const ownerSummary = snapshot.operator.ownerSummary;
  const topAttention = attention.doFirst.slice(0, 4);
  const topWorkPlan = snapshot.todayPlan.slice(0, 4);
  const firstMove = topAttention[0]
    ? {
        ...topAttention[0],
        buttonLabel: "Handle this"
      }
    : {
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
    { label: "Needs owner", value: attention.metrics.ownerNeeds, note: "decisions or review", tone: attention.metrics.ownerNeeds ? "hot" : "trust" },
    { label: "Make money next", value: attention.moneyMoves.length, note: "revenue moves", tone: "money" },
    { label: "AI handled", value: attention.metrics.aiHandled, note: "logged actions", tone: "trust" },
    { label: "Blocked", value: attention.metrics.blockedActions + attention.metrics.providerGaps, note: "setup or connection gaps", tone: attention.metrics.blockedActions || attention.metrics.providerGaps ? "draft" : "trust" }
  ];
  const commandActions = [
    attention.doFirst[0]?.title ?? "No urgent owner decision is blocking Ferocity right now.",
    attention.moneyMoves[0]?.title ?? "No immediate money move is waiting.",
    attention.metrics.needsReview ? `${attention.metrics.needsReview} AI-prepared action${attention.metrics.needsReview === 1 ? "" : "s"} ${attention.metrics.needsReview === 1 ? "needs" : "need"} approval.` : "No AI actions need approval right now.",
    attention.metrics.dueReminders ? `${attention.metrics.dueReminders} reminder${attention.metrics.dueReminders === 1 ? "" : "s"} ${attention.metrics.dueReminders === 1 ? "is" : "are"} due now.` : "No reminders are due now.",
    attention.metrics.providerGaps ? `${attention.metrics.providerGaps} connection gap${attention.metrics.providerGaps === 1 ? "" : "s"} ${attention.metrics.providerGaps === 1 ? "keeps" : "keep"} some work manual.` : "Connected-tool gaps are clear.",
    roiRows[0] ? `${roiRows[0].label} is the top tracked growth source right now.` : "Connect website, forms, campaigns, and sources to see what creates booked work."
  ];
  const firstWeekWins = [
    {
      title: "Set up the lead path",
      detail:
        snapshot.metrics.openLeads > 0
          ? `${snapshot.metrics.openLeads} lead${snapshot.metrics.openLeads === 1 ? "" : "s"} already need visibility.`
          : "Add a form, quote link, or hosted page so new leads are tracked from day one.",
      href: "/app/customer-touchpoints",
      button: "Connect lead path"
    },
    {
      title: "Turn on follow-up",
      detail:
        snapshot.metrics.followUpsDue > 0
          ? `${snapshot.metrics.followUpsDue} follow-up${snapshot.metrics.followUpsDue === 1 ? "" : "s"} need action.`
          : "Create the first lead, estimate, invoice, and review follow-up rules before anything gets lost.",
      href: "/app/lead-command",
      button: "Open follow-up"
    },
    {
      title: "Make money visible",
      detail:
        snapshot.metrics.unpaidInvoices > 0
          ? `${snapshot.metrics.unpaidInvoices} unpaid invoice${snapshot.metrics.unpaidInvoices === 1 ? "" : "s"} need collection visibility.`
          : "Track estimates, invoices, payments, receipts, worker payouts, and job profit in one place.",
      href: "/app/job-tracker",
      button: "Track money"
    },
    {
      title: "Create proof from work",
      detail: "Completed jobs can become review requests, testimonials, before/after proof, posts, SEO updates, and ad/video briefs.",
      href: "/app/proof",
      button: "Open proof"
    },
    {
      title: "Check what is gated",
      detail:
        setupBlockers.length > 0
          ? `${setupBlockers.length} control${setupBlockers.length === 1 ? "" : "s"} need review, connection, or plan access.`
          : "Review what is live, what needs a provider, and what stays behind approval.",
      href: "/app/feature-readiness",
      button: "Truth board"
    }
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
    ["Set up my lead engine", "/app/build-system"],
    ["Follow up with unpaid customers", "/app/cash-collection"],
    ["Plan my workers for today", "/app/crew-itinerary"],
    ["Get me more leads this week", "/app/growth-calendar"],
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
            <p className="eyebrow">Command Center</p>
            <h1>Run the business from one daily command center.</h1>
            <p className="muted">
              Ferocity watches the work queue, prepares the next steps, and brings the important decisions to you.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/welcome">Start Here</Link>
            <Link className="button" href="/app/attention-command">Needs Attention</Link>
            <Link className="button secondary-button" href="/app/ai-workforce">AI Workforce</Link>
            <Link className="button secondary-button" href="/app/feature-map">All tools</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Today</p>
              <h2>{attention.direction.title}</h2>
              <p className="muted">{attention.direction.detail}</p>
            </div>
            <Link className="button" href={attention.direction.href}>Open next action</Link>
          </div>
          <div className="grid section-actions">
            <Metric label="Needs owner" value={attention.metrics.ownerNeeds} detail="Decisions, approvals, or issues" href="/app/attention-command" icon={<BellRing size={16} />} tone={attention.metrics.ownerNeeds ? "high" : ""} />
            <Metric label="AI handled" value={attention.metrics.aiHandled} detail="Actions already logged" href="/app/automation-timeline" icon={<Bot size={16} />} />
            <Metric label="Money moves" value={attention.moneyMoves.length} detail="Revenue actions ready" href="/app/cash-collection" icon={<CircleDollarSign size={16} />} tone={attention.moneyMoves.length ? "medium" : ""} />
            <Metric label="Connection gaps" value={attention.metrics.providerGaps} detail="Keeps work manual" href="/app/integrations" icon={<PlugZap size={16} />} tone={attention.metrics.providerGaps ? "medium" : ""} />
          </div>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Owner briefing</p>
              <h2>What matters now</h2>
              <p className="muted">A short version of the full Attention Command dashboard, based on live workspace data.</p>
            </div>
            <Link className="mini-button" href="/app/attention-command">Full view</Link>
          </div>
          <ul className="list">
            {(attention.nudges.length ? attention.nudges.slice(0, 3) : attention.moneyMoves.slice(0, 3)).map((item) => (
              <li className="list-row" key={`${item.title}-${item.href}`}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${item.urgency === "critical" || item.urgency === "high" ? "high" : item.urgency === "medium" ? "medium" : ""}`}>{item.urgency}</span>
                  <Link className="mini-button" href={item.href}>Open</Link>
                </div>
              </li>
            ))}
            {attention.nudges.length === 0 && attention.moneyMoves.length === 0 ? (
              <li className="list-row"><span className="muted">No urgent owner action is waiting. Connect more sources or add work to let Ferocity monitor more of the business.</span></li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="operator-command-hero">
          <div>
            <p className="eyebrow">Business command bar</p>
            <h2>Tell Ferocity the outcome. It builds the next work plan.</h2>
            <p className="muted">
              Use this when you do not know which page to open. Ferocity prepares the next steps, routes the work,
              and keeps customer-facing actions reviewable.
            </p>
          </div>
          <form className="operator-command-input large-command" action={executeAiWorkforceCommandSimpleAction}>
            <label className="sr-only" htmlFor="dashboard-command">Tell Ferocity what to do</label>
            <input
              id="dashboard-command"
              name="command"
              placeholder="Example: make me a video ad, add this receipt, log hours, follow up with unpaid customers..."
              minLength={8}
              maxLength={2000}
              required
            />
            <button className="mini-button" type="submit">Ask Ferocity</button>
          </form>
        </div>
        <div className="operator-command-chips">
          {commandPrompts.map(([label, href]) => (
            <Link href={href} key={label}>{label}</Link>
          ))}
        </div>
        {recentCommands.length ? (
          <ul className="list compact-list">
            {recentCommands.map((command) => (
              <li className="list-row" key={command.id}>
                <div>
                  <strong>{command.command}</strong>
                  <p className="muted">{command.status.replaceAll("_", " ")} / {dateLabel(command.createdAt.toISOString())}</p>
                </div>
                <Link className="mini-button" href={`/app/ai-workforce/results/${command.id}`}>Open result</Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Ferocity is watching</p>
            <h2>Quiet monitoring, clear nudges.</h2>
            <p className="muted">These are live workspace checks from the current dashboard data. Customer sends and public actions still follow your connection and approval rules.</p>
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
            <h2>Not sure what to do? Choose the work you want off your plate.</h2>
            <p className="muted">
              Start with one lane. Ferocity can guide setup, while manual tools stay available for basic work.
            </p>
          </div>
          <Link className="button" href="/app/build-system">Let Ferocity guide me</Link>
        </div>
        <div className="path-grid">
          {[
            ["1. Pick the lane", "Leads, jobs, money, reviews, marketing, team reminders, or daily owner control.", "/app/welcome"],
            ["2. Let Ferocity build the plan", "Use plain words. Ferocity previews setup before changing anything important.", "/app/build-system"],
            ["3. Add simple work anytime", "Create customers, estimates, jobs, invoices, payments, costs, workers, and reminders yourself.", "/app/service-command"],
            ["4. Connect the outside world", "Add forms, quote links, tracking, customer portals, proof links, and payment readiness.", "/app/customer-touchpoints"],
            ["5. Work the daily list", "Handle hot leads, overdue follow-up, unpaid invoices, worker plans, and AI-prepared actions.", "/app/attention-command"],
            ["6. Check what is live", "See what works now, what needs connection, and what waits for approval.", "/app/feature-readiness"]
          ].map(([title, detail, href]) => (
            <Link className="path-card" href={href} key={title}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">First week value plan</p>
            <h2>What Ferocity should help with first.</h2>
            <p className="muted">
              These are the practical starting moves that turn Ferocity from software into a working business system.
            </p>
          </div>
          <Link className="button" href="/app/build-system">Build this plan</Link>
        </div>
        <div className="path-grid">
          {firstWeekWins.map((win, index) => (
            <Link className="path-card" href={win.href} key={win.title}>
              <span className="step-dot">{index + 1}</span>
              <strong>{win.title}</strong>
              <span>{win.detail}</span>
              <small className="mini-button">{win.button}</small>
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
          {["Needs Attention", "AI Workforce", "Leads", "Jobs", "Money", "Growth"].map((tabName) => (
            <span className={tabName === "Needs Attention" ? "active" : ""} key={tabName}>{tabName}</span>
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
              <h2><BellRing size={18} /> Needs Attention</h2>
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
              <p className="eyebrow">Work queues</p>
              <h2>What should move next</h2>
              <p className="muted">Lead, job, money, and follow-up queues from the current workspace.</p>
            </div>
            <Link className="mini-button" href="/app/owner-command-center">Event feed</Link>
          </div>
          <ul className="list">
            {topWorkPlan.map((item) => (
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
            <ToolLink href="/app/build-system" title="Guided Setup" detail="Guided setup for workflows, reviews, marketing, follow-up, and controls." />
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
          <p className="eyebrow">Team</p>
          <h2>Today&apos;s team picture</h2>
          <ul className="list">
            <li className="list-row"><span>Working now</span><strong>{numberLabel(ownerSummary.workingNow)}</strong></li>
            <li className="list-row"><span>Hours today</span><strong>{hours(ownerSummary.hoursToday)}</strong></li>
            <li className="list-row"><span>Open assignments</span><strong>{numberLabel(ownerSummary.openAssignments)}</strong></li>
            <li className="list-row"><span>Payroll review</span><strong>{numberLabel(ownerSummary.payrollReview)}</strong></li>
          </ul>
          <div className="section-actions">
            <Link className="button secondary-button" href="/app/operations-workforce">Manage team</Link>
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
          <ToolLink href="/app/lead-command" title="Leads & Customers" detail="Leads, conversations, follow-up, pipeline, and customer records." />
          <ToolLink href="/app/service-command" title="Jobs" detail="Jobs, estimates, invoices, reviews, scheduling, and daily service ops." />
          <ToolLink href="/app/operations-workforce" title="Team" detail="Workers, itineraries, time, field costs, payroll review, and staffing needs." />
          <ToolLink href="/app/cash-collection" title="Money" detail="Invoices, payments, reminders, recurring expenses, job cost, and owner review." />
          <ToolLink href="/app/growth-calendar" title="Growth" detail="SEO, reviews, campaigns, content drafts, website tracking, and attribution." />
          <ToolLink href="/app/authority" title="Authority" detail="Turn completed jobs into proof, reviews, case studies, FAQs, posts, video scripts, and website trust." />
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
