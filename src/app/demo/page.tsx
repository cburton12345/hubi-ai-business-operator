import Link from "next/link";
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

const loopSteps = [
  {
    title: "Set up the system",
    body: "Tell Ferocity what the business does, where it works, which services matter, and what should stay approval-only.",
    result: "Services, cities, sources, review flow, and follow-up rules",
    icon: Bot
  },
  {
    title: "Start growth channels",
    body: "Use local SEO, Google profile activity, reviews, referrals, ads, website forms, and MarketplacePro without losing source tracking.",
    result: "Every channel gets tied to a source",
    icon: Megaphone
  },
  {
    title: "Catch and follow up",
    body: "Leads, callbacks, quote requests, estimates, and unanswered messages stay visible until someone handles them.",
    result: "Reply drafts, tasks, reminders, and pipeline movement",
    icon: MessageSquareText
  },
  {
    title: "Turn work into proof",
    body: "Completed jobs feed reviews, customer proof, before/after content, SEO updates, and clearer revenue reporting.",
    result: "Reviews, proof assets, invoices, and ROI",
    icon: ChartNoAxesCombined
  }
];

const commandItems = [
  ["Needs reply", "6 storm leads need a same-day response", "Draft replies"],
  ["Estimate risk", "$28k in viewed estimates need follow-up", "Queue reminders"],
  ["Review opportunity", "4 completed jobs are ready for review requests", "Prepare asks"]
];

const proofPoints = [
  ["Growth", "SEO pages, Google profile activity, reviews, referrals, ads, and source tracking."],
  ["Sales", "Lead inbox, suggested replies, callbacks, notes, estimates, and pipeline stages."],
  ["Operations", "Jobs, appointments, invoices, payment reminders, customer history, and task visibility."],
  ["Control", "Approval gates, connected-account status, usage limits, audit logs, and private dashboards."]
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
    body: "View the practical workflows Ferocity organizes for normal operators.",
    href: "/automations",
    icon: CalendarClock
  }
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
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="hero-command demo-hero">
          <div className="hero-copy">
            <p className="eyebrow">Product demo</p>
            <h1>Ferocity connects marketing, follow-up, and service work.</h1>
            <p>
              The point is simple: set up how the business grows, catch the leads that come from that work, follow up fast,
              collect reviews and payments, then see which channels produce real jobs.
            </p>
            <div className="button-row">
              <Link className="button" href="/demo/tour">
                Start guided tour <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/start?source=demo">
                Start my setup
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
                ["34", "SEO targets", "service and city pages"],
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

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The operating loop</p>
            <h2>Ferocity starts before the lead arrives.</h2>
            <p>
              A CRM starts when somebody becomes a contact. Ferocity starts earlier: services, service areas, lead sources,
              review timing, content controls, and follow-up rules.
            </p>
          </div>
          <div className="demo-proof-flow">
            {["Setup", "Growth", "Lead", "Follow-up", "Job", "Payment", "Review", "ROI"].map((item) => (
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
            <h2>One demo, four plain areas.</h2>
            <p className="muted">
              The detailed pages are still there. This page only shows the core idea so a normal business owner can understand it quickly.
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
                This page is safe to share. Real dashboards, leads, setup controls, invoices, proof requests, and workspace data
                require sign-in.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="button-row">
            <Link className="button" href="/start?source=demo_bottom">
              Start setup <ArrowRight size={16} />
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
