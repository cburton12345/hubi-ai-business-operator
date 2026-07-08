import Link from "next/link";
import { AlertTriangle, Bot, Brain, CalendarDays, CheckCircle2, DollarSign, HardHat, Inbox, Megaphone, ShieldCheck, Users, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { applyAutopilotPresetAction } from "@/app/app/controls/actions";

function tone(value: number) {
  return value > 0 ? "high" : "";
}

export default async function AutopilotPage() {
  const snapshot = await getDashboardSnapshot();
  const urgentCount =
    snapshot.metrics.followUpsDue +
    snapshot.metrics.overdueInvoices +
    snapshot.metrics.actionQueue +
    snapshot.metrics.laborMatchApprovals +
    snapshot.operator.ownerSummary.itineraryNeeded +
    snapshot.operator.ownerSummary.expenseReview +
    snapshot.operator.ownerSummary.payrollReview;

  const autopilotAreas = [
    {
      title: "Owner attention",
      detail: "Daily brief, money radar, risks, blocked AI work, and connected-system events.",
      href: "/app/attention-command",
      icon: <AlertTriangle size={18} />,
      metric: urgentCount,
      metricLabel: "needs review"
    },
    {
      title: "Lead autopilot",
      detail: "New leads, stale leads, callbacks, estimate follow-up, and source tracking.",
      href: "/app/lead-command",
      icon: <Inbox size={18} />,
      metric: snapshot.metrics.followUpsDue,
      metricLabel: "follow-ups due"
    },
    {
      title: "Money autopilot",
      detail: "Invoices, overdue reminders, payment requests, received payments, and cash visibility.",
      href: "/app/cash-collection",
      icon: <DollarSign size={18} />,
      metric: snapshot.metrics.overdueInvoices,
      metricLabel: "overdue invoices"
    },
    {
      title: "Workforce autopilot",
      detail: "Crew day, schedules, time, field costs, mileage, field proof, payroll review, and worker requests.",
      href: "/app/operations-workforce",
      icon: <HardHat size={18} />,
      metric: snapshot.operator.ownerSummary.itineraryNeeded + snapshot.metrics.laborMatchApprovals,
      metricLabel: "staffing items"
    },
    {
      title: "Growth autopilot",
      detail: "SEO, reviews, proof, website pages, campaigns, publishing plans, and attribution.",
      href: "/app/growth-calendar",
      icon: <Megaphone size={18} />,
      metric: snapshot.metrics.visitors,
      metricLabel: "tracked visitors"
    },
    {
      title: "Business brain",
      detail: "Services, prices, areas, customers, proof, history, rules, and connected tools AI should know.",
      href: "/app/business-brain",
      icon: <Brain size={18} />,
      metric: snapshot.brands.length,
      metricLabel: "brand records"
    }
  ];

  const nextMoves = [
    {
      title: "Tell Ferocity what to run",
      detail: "Use plain English to say what AI can watch, draft, recommend, or handle with approval.",
      href: "/app/build-system",
      button: "Build setup"
    },
    {
      title: "Connect the business",
      detail: "Website forms, public links, proof links, Stripe payment-link readiness, worker intake, and tracking snippets live here.",
      href: "/app/customer-touchpoints",
      button: "Connect touchpoints"
    },
    {
      title: "Review AI activity",
      detail: "See prepared work, blocked actions, approvals, handled items, and failed connections.",
      href: "/app/automation-timeline",
      button: "Open timeline"
    },
    {
      title: "Turn on only what is ready",
      detail: "Connections, spending, approvals, billing, and important actions stay controlled.",
      href: "/app/safety-readiness",
      button: "Safety check"
    }
  ];
  const modeCards = [
    {
      preset: "owner_shield",
      title: "Owner Shield",
      detail: "Ferocity watches leads, follow-up, reviews, payments, and daily risk. Normal work goes into the daily brief. Urgent money or customer issues can push you.",
      button: "Use Owner Shield"
    },
    {
      preset: "growth_engine",
      title: "Growth Engine",
      detail: "Ferocity focuses on being seen: website import, SEO drafts, growth pages, reviews, proof, campaigns, publishing plans, and source tracking.",
      button: "Use Growth Engine"
    },
    {
      preset: "manual_first",
      title: "Manual First",
      detail: "Keep Ferocity useful for jobs, bids, invoices, reminders, and records while AI drafts and recommendations stay conservative.",
      button: "Use Manual First"
    }
  ];

  return (
    <QueuePageShell
      eyebrow="Business Autopilot"
      title="Let Ferocity Watch The Business And Tell You What Needs Action"
      description="One simple control room for owner attention, leads, money, workers, growth, and safety."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Current state</p>
            <h2>{snapshot.tenantName}</h2>
            <p className="muted">
              Ferocity can watch the business, prepare work, remind people, summarize what happened, and recommend the next move. The point is simple: less owner chaos, more handled work, more booked income.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">
              <Bot size={16} /> Have AI set it up
            </Link>
            <Link className="button secondary-button" href="/app/setup">
              Choose myself
            </Link>
          </div>
        </div>
        <div className="grid">
          <Metric label="Follow-ups due" value={snapshot.metrics.followUpsDue} tone={tone(snapshot.metrics.followUpsDue)} />
          <Metric label="Action queue" value={snapshot.metrics.actionQueue} tone={tone(snapshot.metrics.actionQueue)} />
          <Metric label="Overdue invoices" value={snapshot.metrics.overdueInvoices} tone={tone(snapshot.metrics.overdueInvoices)} />
          <Metric label="Worker matches" value={snapshot.metrics.laborMatchApprovals} tone={tone(snapshot.metrics.laborMatchApprovals)} />
          <Metric label="Itineraries needed" value={snapshot.operator.ownerSummary.itineraryNeeded} tone={tone(snapshot.operator.ownerSummary.itineraryNeeded)} />
          <Metric label="Expense review" value={snapshot.operator.ownerSummary.expenseReview} tone={tone(snapshot.operator.ownerSummary.expenseReview)} />
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Choose how hands-off you want to be</p>
            <h2>Take back the day without losing control.</h2>
            <p className="muted">
              Pick a mode now and adjust the details later. These modes update existing Ferocity controls, approval rules, and limits. They do not create a second system.
            </p>
          </div>
          <Link className="mini-button" href="/app/controls">Fine-tune controls</Link>
        </div>
        <div className="grid">
          {modeCards.map((mode) => (
            <form action={applyAutopilotPresetAction} className="panel span-4" key={mode.preset}>
              <input type="hidden" name="preset" value={mode.preset} />
              <h3>{mode.title}</h3>
              <p className="muted">{mode.detail}</p>
              <button className="mini-button" type="submit">{mode.button}</button>
            </form>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        {autopilotAreas.map((area) => (
          <Link className="panel span-4 status-card" href={area.href} key={area.title}>
            <div>
              <h2>{area.icon} {area.title}</h2>
              <p className="muted">{area.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${area.metric > 0 ? "medium" : ""}`}>{area.metric.toLocaleString()} {area.metricLabel}</span>
              <span className="mini-button">Open</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><Workflow size={18} /> How Autopilot Works</h2>
            <p className="muted">The owner chooses the level of control. Ferocity keeps routine work moving and asks before anything important happens.</p>
          </div>
          <Link className="mini-button" href="/app/controls">Open controls</Link>
        </div>
        <div className="setup-step-grid">
          <Step number="1" title="Get seen" body="Ferocity prepares the website, lead forms, SEO targets, reviews, proof, campaigns, and source tracking that bring more people in." />
          <Step number="2" title="Catch the work" body="Leads, quote requests, calls, forms, referrals, MarketplacePro, and connected sources flow into one follow-up loop." />
          <Step number="3" title="Move it forward" body="AI watches stale leads, estimates, jobs, invoices, reviews, reminders, workers, and customer replies." />
          <Step number="4" title="Interrupt only when needed" body="Routine work goes to the daily brief. Owner alerts are for money, risk, customer issues, approvals, and urgent opportunities." />
        </div>
      </section>

      <section className="grid section-actions">
        {nextMoves.map((move) => (
          <article className="panel span-6" key={move.title}>
            <div className="list-row flush-row">
              <div>
                <h2><CheckCircle2 size={18} /> {move.title}</h2>
                <p className="muted">{move.detail}</p>
              </div>
              <Link className="mini-button" href={move.href}>{move.button}</Link>
            </div>
          </article>
        ))}
      </section>

      <section className="panel section-actions">
        <h2><ShieldCheck size={18} /> Autopilot Does Not Mean Losing Control</h2>
        <p className="muted">
          Ferocity can run more of the business only where the owner allows it. The default path is draft, review, approve, log, and measure. Direct tools stay available for admins who want full control.
        </p>
        <div className="button-row">
          <Link className="button" href="/app/ai-monitoring">
            <CalendarDays size={16} /> Daily Brief
          </Link>
          <Link className="button secondary-button" href="/app/feature-map">
            <Users size={16} /> All tools
          </Link>
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone: toneName }: { label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
      <small className={`pill ${toneName ?? ""}`}>{value > 0 ? "check" : "clear"}</small>
    </section>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="setup-step-card">
      <span className="step-dot">{number}</span>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
