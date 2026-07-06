import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  FileText,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  Star
} from "lucide-react";

export const metadata: Metadata = {
  title: "Ferocity Demo: AI Operating System for Businesses",
  description:
    "See how Ferocity watches a business, tells the owner what needs attention, and automates approved work.",
  alternates: {
    canonical: "/demo"
  }
};

const loopSteps = [
  {
    title: "Grade the business",
    body: "Ferocity checks how leads, reviews, follow-up, website conversion, jobs, and invoices are working together.",
    result: "Business score, key gaps, and top actions",
    icon: Bot
  },
  {
    title: "Tell the owner what needs done",
    body: "Ferocity turns leads, jobs, callbacks, estimates, invoices, reviews, and worker activity into a practical action list.",
    result: "Owner briefing, daily work list, risk alerts, and next actions",
    icon: CalendarClock
  },
  {
    title: "Catch and follow up",
    body: "Leads, callbacks, quote requests, estimates, and unanswered messages stay visible until someone handles them.",
    result: "Reply drafts, tasks, reminders, and pipeline movement",
    icon: MessageSquareText
  },
  {
    title: "Grow the business",
    body: "Completed jobs feed reviews, customer proof, before/after content, SEO updates, Google profile work, and clearer revenue reporting.",
    result: "Marketing proof, reviews, paid invoices, and ROI",
    icon: Megaphone
  }
];

const commandItems = [
  ["Needs reply", "6 storm leads need a same-day response", "Draft replies"],
  ["Estimate risk", "$28k in viewed estimates need follow-up", "Queue reminders"],
  ["Review opportunity", "4 completed jobs are ready for review requests", "Prepare asks"]
];

const proofPoints = [
  ["Owner Command", "Daily briefing, money radar, risks, approvals, decisions, and what the AI handled."],
  ["Operations", "Jobs, worker day plans, punch-in visibility, field proof, invoices, payment reminders, and task visibility."],
  ["Sales", "Lead inbox, suggested replies, callbacks, notes, estimates, and pipeline stages."],
  ["Finance", "Invoices, payment reminders, ledgers, collection alerts, and revenue visibility."],
  ["Marketing", "SEO pages, Google profile activity, reviews, referrals, ads, content, proof, and source tracking."],
  ["Control", "Approvals, connected accounts, spending limits, activity logs, and private dashboards."]
];

const controlRows = [
  ["Follow-up", "AI can prepare replies, reminders, stale lead recovery, and estimate follow-up. The business can keep sends manual or require review before messages go out."],
  ["Marketing", "AI can draft SEO, Google profile posts, review content, proof posts, and campaigns. Publishing waits for permission."],
  ["Money", "AI can flag overdue invoices, prepare reminders, record payments, and show cash risk. Online payment links depend on connected Stripe settings."],
  ["Operations", "AI can build daily work lists, job follow-up, owner queues, and worker tasks. Owners keep final control over people and schedules."]
];

const deepLinks = [
  {
    title: "Guided tour",
    body: "Walk through the full loop from setup to revenue tracking.",
    href: "/demo/tour",
    icon: ArrowRight
  },
  {
    title: "Roofing example",
    body: "See a concrete service-business sample with storm leads, reviews, and follow-up.",
    href: "/demo/acme-roofing",
    icon: FileText
  },
  {
    title: "Automations",
    body: "View the repeat workflows Ferocity can prepare, remind, log, and help run.",
    href: "/automations",
    icon: CalendarClock
  }
];

const demoLayers = [
  ["Step 1", "Audit the business", "Business Grader shows what is missing before anyone signs up."],
  ["Step 2", "Show what needs done", "Owner Command Center ranks today's work, money, risks, approvals, and AI-handled items."],
  ["Step 3", "Plan the day", "Operations & Workforce tracks jobs, worker day plans, punch-ins, schedules, expenses, mileage, proof, and job cost."],
  ["Step 4", "Work the leads", "Lead Follow-Up keeps replies, callbacks, estimates, and stale opportunities visible."],
  ["Step 5", "Grow from the work", "Marketing turns reviews, proof, SEO, Google profile activity, campaigns, and source data into new demand."]
];

export default function DemoPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/about">About</Link>
            <Link href="/features">Features</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/connect-website">Connect Website</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/install">Install App</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="hero-command demo-hero">
          <div className="hero-copy">
            <p className="eyebrow">Product demo</p>
            <h1>See how Ferocity turns business chaos into an owner action list.</h1>
            <p>
              Ferocity watches leads, sales, jobs, workers, invoices, reviews, marketing, and customer follow-up.
              The owner sees what matters, what AI prepared, and what needs approval, without having to babysit every corner of the business.
            </p>
            <div className="button-row">
              <Link className="button" href="/business-health-score">
                Run free grader <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/start?source=demo">
                Get my setup plan
              </Link>
              <Link className="button secondary-button" href="/pricing">
                View plans
              </Link>
            </div>
          </div>

          <div className="demo-command-center">
            <div className="preview-topline">
              <div>
                <span className="eyebrow">Sample command center</span>
                <strong>Beta Roofing Co</strong>
              </div>
              <span className="live-pill">Public sample</span>
            </div>
            <div className="demo-metric-grid">
              {[
                ["18", "new leads", "6 need reply"],
                ["$84k", "pipeline", "$28k viewed estimates"],
                ["34", "growth targets", "SEO, posts, reviews"],
                ["12", "review asks", "ready after jobs"]
              ].map(([value, label, hint]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                  <small>{hint}</small>
                </div>
              ))}
            </div>
            <div className="demo-alert-list">
              {commandItems.map(([type, text, action]) => (
                <div key={text}>
                  <CheckCircle2 size={16} />
                  <strong>{type}</strong>
                  <span>{text}</span>
                  <em>{action}</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Demo map</p>
          <h2>One system, five outcomes.</h2>
          <p className="muted">
            Get customers. Win jobs. Run the day. Get paid faster. Let AI handle the busy work.
          </p>
          <div className="grid section-actions">
            {demoLayers.map(([step, title, body]) => (
              <article className="panel span-4" key={title}>
                <span className="pill">{step}</span>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The operating loop</p>
            <h2>Ferocity starts before the lead arrives and keeps working after the job is done.</h2>
            <p>
              A CRM starts when somebody becomes a contact. Ferocity starts earlier: website connection, SEO, reviews,
              forms, source tracking, campaigns, and AI setup. Then it carries the lead through follow-up, work, payment,
              proof, and reporting. It fits contractors, practices, e-commerce, agencies, sales teams, multi-location owners,
              and connected rental workflows.
            </p>
          </div>
          <div className="demo-proof-flow">
            {["Setup", "Profile", "Campaign", "Lead", "Follow-up", "Job", "Payment", "Review", "ROI"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="feature-loop">
          {loopSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title}>
                <span>{index + 1}</span>
                <Icon size={20} />
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <small>{step.result}</small>
              </article>
            );
          })}
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">What is included</p>
            <h2>One demo, five plain areas.</h2>
            <p className="muted">
              This page shows the core idea quickly: Ferocity helps run the loop, then uses the loop to create more booked revenue opportunities.
            </p>
          </div>
          <div className="value-ladder">
            {proofPoints.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Autopilot with controls</p>
          <h2>The business chooses how much AI runs.</h2>
          <p className="muted">
            Ferocity can act like cruise control for the repeat work, but it does not force full automation. The owner can keep
            messages, public posts, payments, and connected-account actions reviewed until trust is earned.
          </p>
          <div className="grid section-actions">
            {controlRows.map(([title, body]) => (
              <article className="panel span-6" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-grid">
          {deepLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="panel" href={item.href} key={item.title}>
                <Icon size={20} />
                <h2>{item.title}</h2>
                <p className="muted">{item.body}</p>
              </Link>
            );
          })}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Public demo. Private business data.</h2>
              <p className="muted">
                This page is safe to share. Real dashboards, leads, setup controls, invoices, proof requests, and business data
                require sign-in.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/start?source=demo_bottom">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Compare plans
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
