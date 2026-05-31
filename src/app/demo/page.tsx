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
  Siren,
  Sparkles
} from "lucide-react";

const marketplaceProUrl = "https://marketplacepro.live";

const tourSteps = [
  {
    title: "Get found",
    body: "Create a practical plan for service pages, local SEO, reviews, and source tracking.",
    href: "/demo/acme-roofing",
    icon: Megaphone
  },
  {
    title: "Catch the lead",
    body: (
      <>
        Route forms, calls, quote requests, and{" "}
        <Link className="inline-link" href={marketplaceProUrl}>
          MarketplacePro
        </Link>{" "}
        leads into a visible lead queue.
      </>
    ),
    href: "/demo/acme-roofing#lead-flow",
    icon: MessageSquareText
  },
  {
    title: "Follow up",
    body: "Track missed callbacks, stale leads, estimate reminders, and review request tasks.",
    href: "/demo/acme-roofing#follow-up",
    icon: CalendarClock
  },
  {
    title: "Prove ROI",
    body: "Connect pages and campaigns to leads, jobs, invoices, reviews, and revenue.",
    href: "/demo/acme-roofing#roi",
    icon: ChartNoAxesCombined
  }
];

const featureCards = [
  { title: "Build My System", body: "Plain-English setup for workflows, SEO, reviews, ads, and integrations.", icon: Bot },
  { title: "Marketing Work", body: "Draft-first content, service pages, GBP posts, review requests, and attribution.", icon: Megaphone },
  { title: "Customer Proof", body: "Testimonials, before/after links, consent, and proof-to-content drafts.", icon: CheckCircle2 },
  { title: "Operator Console", body: "Lead response, conversations, callbacks, pipeline, notes, and timeline.", icon: MessageSquareText },
  { title: "Service Ops", body: "Jobs, estimates, invoices, scheduling, dispatch planning, and customer history.", icon: FileText },
  { title: "Safety Controls", body: "Approvals, connected-account status, usage limits, and audit logs.", icon: ShieldCheck }
];

const demoActions = [
  ["Set up growth", "SEO, reviews, forms, ads, and sources", "Build plan"],
  ["Lead recovery", "3 leads need a reply today", "Draft reply"],
  ["Estimate follow-up", "$28k in viewed estimates", "Queue reminders"],
  ["Review flow", "4 completed jobs", "Draft requests"]
];

const commandMetrics = [
  ["18", "new leads", "6 need a same-day reply"],
  ["$84k", "open pipeline", "$28k viewed estimates"],
  ["34", "SEO targets", "service and city pages"],
  ["12", "review asks", "ready after completed work"]
];

const operatorAlerts = [
  ["Hot lead", "Storm repair request from North Ridge has no reply yet.", "Draft first response"],
  ["Estimate risk", "$14,200 roof estimate was viewed twice and is aging.", "Queue follow-up"],
  ["Revenue leak", "Two invoices are overdue and still have no reminder drafted.", "Prepare reminder"]
];

const proofLoop = [
  ["System setup", "Services, cities, channels, and controls", "owner goals become a reviewed setup plan"],
  ["Growth channel", "SEO, GBP, ads, referrals, or marketplace", "source rules exist before leads arrive"],
  ["Website source", "Storm repair city page", "utm_source=local_seo / page_url captured"],
  ["Lead captured", "North Ridge roof leak", "source, service, city, form, and consent stay attached"],
  ["Follow-up queued", "First response and callback", "draft message, task, due time, owner"],
  ["Estimate created", "$14,200 roof repair", "viewed estimate creates follow-up pressure"],
  ["Job booked", "Crew scheduled Friday", "service area, technician, customer history"],
  ["Invoice sent", "$14,200 balance", "payment request, manual payment, ledger"],
  ["Review requested", "After job completion", "private feedback check before public ask"],
  ["Proof captured", "Customer story and photos", "consent, before/after assets, testimonial, location"],
  ["ROI reported", "Local SEO produced revenue", "lead source tied to job, payment, review"]
];

const operationsProof = [
  ["Payments", "Invoice payment links, manual payments, Stripe webhook mapping, ledger entries."],
  ["Automations", "Stale leads, estimates, invoice follow-up, callbacks, reviews, and SEO refreshes."],
  ["Customer proof", "Completed jobs can become reviewed testimonials, before/after galleries, SEO proof, and social drafts."],
  ["Connected tools", "Email, SMS, calendar, payments, ads, reviews, publishing, and MarketplacePro stay organized."],
  ["Website connector", "Customer site gets form links, embeds, UTM/page/referrer tracking, and approved SEO export paths."]
];

const automationRunway = [
  "Speed-to-lead reply",
  "Missed callback alert",
  "Stale lead recovery",
  "Estimate follow-up",
  "Invoice follow-up",
  "Review request",
  "SEO refresh",
  "GBP post draft"
];

const connectionSteps = [
  ["Build My System", "Set services, service areas, lead sources, review flow, follow-up timing, and approvals first."],
  ["Website connector", "Add a Ferocity quote link, embedded form, or tracking helper to the customer's site."],
  ["Lead forms", "Every submission can carry source, campaign, page URL, and referrer data."],
  ["SEO pages", "Publish approved drafts to the customer's website, a Ferocity hosted page, or a manual export workflow."],
  ["Call and manual sources", "Track phone calls, referrals, Facebook groups, and walk-ins as real lead sources."],
  ["MarketplacePro", "Route marketplace requests into the same lead queue and follow-up system."],
  ["Jobs and money", "Tie the lead to estimates, jobs, invoices, reviews, and revenue."]
];

const capabilityGroups = [
  {
    title: "Growth",
    href: "/features",
    items: [
      ["Local SEO pages", "Service and city pages tied to real lead capture."],
      ["Google profile posts", "GBP post drafts and review activity ideas."],
      ["Review engine", "Requests, response drafts, and unhappy-customer routing."],
      ["Customer proof", "Testimonials, before/after links, consent, and job stories."],
      ["Campaign tracking", "Source, city, service, and channel attribution."],
      ["Content calendar", "Planned posts, drafts, approvals, and scheduling."],
      ["SEO refreshes", "Keep important pages current with real business proof."]
    ]
  },
  {
    title: "Leads & Sales",
    href: "/demo/tour",
    items: [
      ["Lead inbox", "Forms, calls, messages, quote requests, and marketplace leads."],
      ["Speed-to-lead", "First-response drafts and unanswered lead alerts."],
      ["Pipeline stages", "New, qualified, estimate sent, follow-up, won, and lost."],
      ["Estimate tracking", "Viewed estimates, aging estimates, and follow-up tasks."],
      ["Callback queue", "Scheduled callbacks and missed follow-up visibility."],
      ["Close signals", "Priority, urgency, source, service, and next step."]
    ]
  },
  {
    title: "Service Work",
    href: "/demo/acme-roofing",
    items: [
      ["Customer history", "Leads, jobs, notes, estimates, invoices, and reviews together."],
      ["Job tracking", "Scheduled work, completed work, and open tasks."],
      ["Invoice follow-up", "Payment reminder drafts and overdue invoice visibility."],
      ["Scheduling", "Appointments, callbacks, jobs, and calendar planning."],
      ["Technician view", "Team, route, and dispatch planning structure."],
      ["Service areas", "Cities and neighborhoods tied to leads and pages."]
    ]
  },
  {
    title: "Automations",
    href: "/automations",
    items: [
      ["Stale lead recovery", "Old leads stay visible until handled."],
      ["Estimate follow-up", "Viewed and aging estimates create next steps."],
      ["Review request flow", "Ask after completed work with review controls."],
      ["Proof capture", "Ask customers for photos, video links, and testimonials."],
      ["Missed callback alert", "Callbacks do not disappear from the day."],
      ["Message templates", "SMS and email drafts for common moments."],
      ["Operator alerts", "Lead drops, ignored estimates, and overdue work."]
    ]
  },
  {
    title: "Control & Scale",
    href: "/pricing",
    items: [
      ["Approval queue", "Customer-facing work goes through review."],
      ["Usage controls", "AI, email, SMS, pages, seats, and automations by plan."],
      ["Audit log", "See what changed, who approved it, and what happened."],
      ["Connected accounts", "Email, SMS, calendar, payments, ads, and marketplace paths."],
      ["Multi-workspace", "Separate businesses, brands, roles, and dashboards."],
      ["Private app", "Public demo stays public. Real business data stays signed-in."]
    ]
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
            <h1>See how Ferocity turns marketing into booked work.</h1>
            <p>
              Follow the path from setup to getting found, capturing a lead, following up, booking the job, collecting payment,
              requesting a review, and seeing what produced revenue.
            </p>
            <div className="button-row">
              <Link className="button" href="/demo/tour">
                Start guided tour <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/demo/acme-roofing">
                Open roofing example
              </Link>
              <Link className="button secondary-button" href="/start?source=demo">
                Start my setup
              </Link>
            </div>
          </div>
          <div className="demo-command-center">
            <div className="preview-topline">
              <div>
                <span className="eyebrow">Demo command center</span>
                <strong>Beta Roofing Co</strong>
              </div>
              <span className="live-pill">Public sample</span>
            </div>
            <div className="demo-metric-grid">
              {commandMetrics.map(([value, label, hint]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                  <small>{hint}</small>
                </div>
              ))}
            </div>
            <div className="demo-alert-list">
              {operatorAlerts.map(([type, text, action]) => (
                <div key={text}>
                  <Siren size={16} />
                  <strong>{type}</strong>
                  <span>{text}</span>
                  <em>{action}</em>
                </div>
              ))}
            </div>
            <div className="demo-command-footer">
              <span><Sparkles size={15} /> Setup changes are reviewed first</span>
              <span><ShieldCheck size={15} /> Customer-facing actions need approval</span>
            </div>
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">What this connects</p>
            <h2>The system starts before the lead arrives.</h2>
            <p>
              Ferocity first maps the business, services, service areas, channels, and controls. Then every page, post, ad,
              referral, form, or marketplace request can be tied to the follow-up, estimate, job, invoice, review, and revenue that came after it.
            </p>
          </div>
          <div className="demo-proof-flow">
            {["Setup", "SEO / ads / referrals", "Lead", "Estimate", "Job", "Invoice", "Review", "Better next action"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">Proof loop</p>
            <h2>One loop from attention to revenue.</h2>
            <p className="muted">
              Ferocity keeps the handoff clear: create demand, catch the lead, follow up, do the work, collect payment,
              ask for the review, and know what produced the money.
            </p>
          </div>
          <div className="source-step-grid">
            {proofLoop.map(([title, body, detail]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">Real operating pieces</p>
            <h2>The details are what make the system useful.</h2>
            <p>
              Lead source tracking, payment records, ledgers, approvals, usage controls, connected-account status, and follow-up
              queues keep the business from losing track of real opportunities.
            </p>
          </div>
          <div className="value-ladder">
            {operationsProof.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="source-tracking-band">
          <div>
            <p className="eyebrow">How it connects</p>
            <h2>Ferocity starts by setting up what should be tracked.</h2>
            <p className="muted">
              A business can start with AI-guided setup, marketing setup, or a basic lead workflow. Either way, Ferocity defines the
              source rules first so website forms, hosted pages, SEO pages, Google profile activity, reviews, ads, Facebook groups,
              referrals, phone calls, manual entries, and MarketplacePro requests stay tied to outcomes.
            </p>
          </div>
          <div className="source-step-grid">
            {connectionSteps.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="demo-workbench">
          <div className="section-heading">
            <p className="eyebrow">Click-through demo map</p>
            <h2>Pick where the business wants to start.</h2>
          </div>
          <div className="demo-action-grid">
            {demoActions.map(([title, body, action]) => (
              <Link className="demo-action-card" href="/demo/tour" key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
                <em>{action}</em>
              </Link>
            ))}
          </div>
        </section>

        <section className="demo-automation-runway">
          <div>
            <p className="eyebrow">Automation runway</p>
            <h2>Useful automations, understandable names.</h2>
            <p className="muted">
              Ferocity organizes replies, tasks, reminders, queues, and logs. The owner stays in control of customer messages,
              publishing, ad changes, and connected accounts.
            </p>
          </div>
          <div className="automation-chip-grid">
            {automationRunway.map((item) => (
              <span key={item}>
                <CheckCircle2 size={15} />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="demo-capability-map">
          <div className="section-heading">
            <p className="eyebrow">Advanced capability map</p>
            <h2>The deeper system is still here.</h2>
            <p className="muted">
              These are the pieces Ferocity organizes as a business grows. Start with one or two areas, then expand without losing the
              customer, job, revenue, and review history.
            </p>
          </div>
          <div className="capability-group-grid">
            {capabilityGroups.map((group) => (
              <article className="capability-group" key={group.title}>
                <div className="capability-group-title">
                  <h3>{group.title}</h3>
                  <Link href={group.href}>Open</Link>
                </div>
                <div className="capability-chip-list">
                  {group.items.map(([title, body]) => (
                    <Link className="capability-chip" href={group.href} key={title}>
                      <strong>{title}</strong>
                      <span>{body}</span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>What this demo is showing</h2>
              <p className="muted">
                This is a public sample of the day-to-day workspace: what needs attention, what action is next, and where leads
                turn into revenue.
              </p>
            </div>
          </div>
          <div className="value-ladder">
            {[
              ["Growth", "SEO pages, reviews, GBP activity, attribution, campaign ideas."],
              ["Sales", "Lead capture, replies, notes, pipeline, estimate follow-up."],
              ["Operations", "Jobs, appointments, invoices, callbacks, reminders, task visibility."],
              ["Control", "Approvals, audit logs, usage limits, connected-account status, no surprise sends."]
            ].map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        <div className="button-row">
          <Link className="mini-button" href="/features">See features</Link>
          <Link className="mini-button secondary-button" href="/automations">See automations</Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Demo Path</h2>
              <p className="muted">A simple walkthrough for a normal business owner.</p>
            </div>
            <Link className="mini-button" href="/demo/tour">
              Guided tour
            </Link>
          </div>
          <div className="operating-loop">
            {tourSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Link className="loop-step clickable-step" href={step.href} key={step.title}>
                  <Icon size={18} />
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="public-grid">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
            <div className="panel" key={feature.title}>
              <Icon size={20} />
              <h2>{feature.title}</h2>
              <p className="muted">{feature.body}</p>
            </div>
            );
          })}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Automations People Actually Understand</h2>
              <p className="muted">
                Ferocity creates drafts, reminders, queues, and alerts for lead replies, callbacks, stale leads, estimates, invoices,
                reviews, and SEO updates. Customer-facing actions stay behind approval.
              </p>
            </div>
            <Link className="mini-button" href="/automations">
              View automations
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Choose The Right Level</h2>
              <p className="muted">
                Some businesses only need lead capture and follow-up. Others need SEO, reviews, jobs, estimates, invoices, and higher usage limits.
              </p>
            </div>
            <Link className="mini-button" href="/pricing">
              View plans
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Private Dashboard Stays Private</h2>
              <p className="muted">
                Public demo pages are safe to share. The real Ferocity app still requires sign-in before anyone can see workspace dashboards,
                leads, setup controls, or business data.
              </p>
            </div>
            <Link className="mini-button" href="/login">
              Sign in
            </Link>
            <Link className="mini-button secondary-button" href="/start?source=demo_private_dashboard">
              Request access
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
