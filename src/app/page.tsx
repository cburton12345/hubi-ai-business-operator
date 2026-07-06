import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BellRing, ChartNoAxesCombined, CheckCircle2, Clock3, MessageSquareText, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";

const operatorCards = [
  { label: "New leads", value: "18", note: "6 need fast reply", tone: "hot" },
  { label: "Pipeline", value: "$84k", note: "open value", tone: "money" },
  { label: "Campaigns", value: "9", note: "drafts in review", tone: "trust" },
  { label: "Content targets", value: "34", note: "SEO, posts, reviews", tone: "draft" }
];

const actionQueue = [
  "AI found 3 hot leads before they went cold",
  "AI built today's worker task list from jobs and callbacks",
  "AI prepared follow-up for 5 estimates that could still close",
  "AI flagged 2 unpaid invoices before cash gets tight",
  "AI turned 4 completed jobs into review and proof tasks",
  "AI recommends a campaign based on real demand this week"
];

const consoleTabs = ["Today", "Marketing", "Leads", "Jobs"];

const pipelineRows = [
  ["Storm leads", "$42k", "high"],
  ["Repair estimates", "$28k", "medium"],
  ["Review asks", "12", "low"]
];

const walkthroughSteps = [
  ["1", "Find the money leaks", "Missed leads, weak follow-up, unpaid invoices, thin reviews, unclear marketing, and scattered work."],
  ["2", "Build the autopilot", "Website capture, source tracking, owner alerts, follow-up, reviews, jobs, payments, and approvals."],
  ["3", "Book more income", "Respond faster, follow up more often, collect sooner, create proof, and know what to do next."]
];

const whatItDoes = [
  "Shows what needs attention today: leads, money, customers, workers, approvals, and risks.",
  "Prepares replies, follow-ups, reminders, reviews, invoices, tasks, and marketing drafts.",
  "Tracks where leads came from and what turned into booked income.",
  "Keeps AI controlled: the owner chooses what runs, what needs approval, and what stays manual."
];

const fiveOutcomes = [
  ["Create more demand", "Website, SEO, reviews, Google profile work, campaigns, proof, referrals, and source tracking."],
  ["Turn leads into booked income", "Fast lead response, callback reminders, estimate follow-up, pipeline visibility, and next-best actions."],
  ["Run the day with less chaos", "Jobs, schedules, crews, worker requests, receipts, mileage, task lists, field proof, and owner alerts."],
  ["Collect money sooner", "Invoices, manual payment records, overdue reminders, ledger visibility, cash risk, and online payment links when payments are connected."],
  ["Let AI carry the repeat work", "AI watches, drafts, summarizes, routes, reminds, and asks for approval when a person is needed."]
];

const frontAndCenter = [
  ["AI employees", "Digital workers for reception, sales follow-up, office work, marketing, collections, and operations."],
  ["Owner command center", "One place to see hot leads, money leaks, overdue work, approvals, reminders, and what AI handled."],
  ["Website-to-revenue tracking", "Connect forms, campaigns, reviews, ads, SEO/GEO work, source tracking, jobs, invoices, and outcomes."],
  ["Follow-up machine", "Prepare replies, callbacks, stale lead recovery, estimate follow-up, invoice reminders, and review requests."],
  ["Booked-income loop", "Move leads into estimates, jobs or orders, invoices, payment records, reviews, proof, and better next actions."],
  ["Controlled autopilot", "Let AI prepare approved work while messages, public posts, payments, and ads stay under your control."]
];

const companyTypes = [
  ["Owners with one business", "A single company can run leads, follow-up, jobs or orders, payments, reviews, marketing, and priorities in one place."],
  ["Contractors", "Bids, jobs, crews, materials, invoices, reviews, proof, and follow-up."],
  ["Law firms", "Lead intake, consult requests, follow-up, reviews, source tracking, and owner visibility."],
  ["E-commerce", "Campaigns, abandoned opportunities, customer proof, retention, email, and revenue reporting."],
  ["Clinics and chiropractors", "New patient requests, scheduling, reminders, reputation, referrals, and follow-up."],
  ["Agencies and sales teams", "Pipeline, proposals, callbacks, tasks, campaigns, attribution, and team accountability."],
  ["Owners with several ventures", "Switch between businesses, brands, properties, projects, or side ventures without mixing private data."],
  ["Growing companies", "Add people, brands, approval rules, alerts, reports, and command-center visibility as the operation gets bigger."],
  ["Rental owners", "Use Ferocity for owner visibility, leads, reminders, and follow-up while deeper rental workflows connect through dedicated rental tools."]
];

const autopilotSteps = [
  ["1", "Find the gaps", "Website, SEO, Google profile, reviews, lead capture, follow-up, jobs, invoices, and owner alerts."],
  ["2", "Build the system", "Ferocity recommends the setup: forms, source tracking, workflows, content, reviews, worker tasks, and safety controls."],
  ["3", "Run the work", "AI watches the business, prepares task lists and next actions, and escalates money, risk, or decisions."]
];

const businessSystems = [
  ["AI receptionist", "Lead intake, missed messages, first replies, handoffs, booking paths, and urgent owner alerts."],
  ["AI sales assistant", "Pipeline movement, callbacks, stale lead recovery, proposal follow-up, and next-best actions."],
  ["AI office manager", "Tasks, schedules, reminders, job or order visibility, owner queues, and daily briefings."],
  ["AI marketing assistant", "Website connection, campaign ideas, SEO/GEO drafts, reviews, proof, source tracking, and content plans."],
  ["AI collections helper", "Invoices, manual payment records, overdue reminders, ledgers, cash alerts, and payment links when payments are connected."],
  ["AI operations helper", "Workflows, approvals, team activity, exceptions, risks, and what needs attention today."]
];

const connectedTools = [
  ["Website", "Lead forms, quote buttons, embedded capture, tracking helper, hosted pages, and approved publishing paths."],
  ["Marketing platforms", "Google profile work, SEO/GEO planning, social campaigns, ads, reviews, UTM/source tracking, and proof content."],
  ["Inbox and alerts", "Email, app alerts, owner notifications, setup messages, reports, and follow-up reminders."],
  ["Payments", "Invoices, manual payment records, overdue reminders, ledger visibility, and Stripe-connected payment links when ready."],
  ["Operations", "Jobs, orders, tasks, schedules, workers, proofs, receipts, and customer history."],
  ["Connected systems", "Marketplace, rental, bid, auction, safety, and specialty systems can feed the owner command center when the workflow fits."]
];

const controlPromises = [
  ["You choose what AI runs", "Turn on the parts you want: follow-up, jobs, invoices, reviews, marketing, owner alerts, or setup help."],
  ["Approval stays available", "Keep messages, public posts, payment requests, and ads in review until the business is ready."],
  ["Nothing important disappears", "Ferocity shows the work it prepared, what it handled, what is blocked, and what still needs a person."],
  ["Connect what you already use", "App alerts, email, payments, calendars, websites, ads, and reviews can connect as the business grows."]
];

export const metadata: Metadata = {
  title: "Ferocity | AI Workforce and Operating System for Modern Businesses",
  description:
    "Ferocity gives modern businesses an AI workforce that helps respond faster, follow up, get paid, create marketing, and run approved repeat work.",
  alternates: {
    canonical: "/"
  }
};

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ferocity",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://ferocity.live",
    description:
      "AI operating system for modern businesses. Ferocity gives owners and teams an AI workforce that finds money leaks, follows up, creates marketing, tracks work, and moves approved repeat work forward.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      category: "Free trial"
    },
    audience: {
      "@type": "Audience",
      audienceType: "Businesses that need leads, follow-up, sales, marketing, operations, and revenue tracking"
    }
  };

  return (
    <main className="public-page public-home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/install">Install App</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="hero-command">
          <div className="hero-copy">
            <p className="eyebrow">AI operating system for modern businesses</p>
            <h1>Run the business without the business running you.</h1>
            <p>
              Ferocity watches leads, follow-up, jobs, payments, reviews, marketing, and owner alerts in one place.
              It tells the business what matters, prepares the next action, and runs approved workflows so owners can get time,
              focus, and control back.
            </p>
            <ul className="hero-checklist" aria-label="What Ferocity does">
              {whatItDoes.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <Link className="button" href="/business-health-score">
                Start with free grader <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/demo">
                See how it works
              </Link>
              <Link className="button secondary-button" href="/pricing">
                View plans
              </Link>
              <Link className="button secondary-button" href="/install">
                Install app
              </Link>
              <Link className="button secondary-button" href="/login">
                Sign in
              </Link>
            </div>
            <div className="trust-strip" aria-label="Safety controls">
              <span><ShieldCheck size={15} /> No surprise changes</span>
              <span><Clock3 size={15} /> Fewer missed leads</span>
              <span><ChartNoAxesCombined size={15} /> Revenue tracking</span>
            </div>
          </div>

          <div className="product-console" aria-label="Ferocity command center preview">
            <div className="console-topbar">
              <div>
                <span className="eyebrow">What the owner sees</span>
                <strong>Beta Roofing Co</strong>
              </div>
              <span className="live-pill">Sample</span>
            </div>
            <div className="console-tabs" aria-label="Console areas">
              {consoleTabs.map((tabName) => (
                <span className={tabName === "Today" ? "active" : ""} key={tabName}>{tabName}</span>
              ))}
            </div>
            <div className="preview-metrics console-metrics">
              {operatorCards.map((card) => (
                <div className={`preview-metric tone-${card.tone}`} key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </div>
              ))}
            </div>
            <div className="console-main">
              <section className="console-panel">
                <div className="console-heading">
                  <h2><BellRing size={18} /> Today</h2>
                  <small>Work to handle</small>
                </div>
                <ul className="action-stack">
                  {actionQueue.map((item) => (
                    <li key={item}><span />{item}</li>
                  ))}
                </ul>
              </section>
              <section className="console-panel">
                <div className="console-heading">
                  <h2><Sparkles size={18} /> Recommendation</h2>
                  <small>What to do next</small>
                </div>
                <div className="recommend-card">
                <strong>Work the money first</strong>
                  <p>6 hot leads and $28k in viewed estimates need action. Ferocity prepares replies, reminders, invoice follow-up, and review tasks.</p>
                  <Link href="/demo">View demo</Link>
                </div>
              </section>
            </div>
            <div className="console-pipeline">
              <div className="console-heading">
                <h2><ChartNoAxesCombined size={18} /> Source to revenue</h2>
                <small>What created work</small>
              </div>
              {pipelineRows.map(([name, value, priority]) => (
                <div className="pipeline-row" key={name}>
                  <strong>{name}</strong>
                  <span>{value}</span>
                  <i className={`bar-${priority}`} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Why owners buy</p>
          <h2>Ferocity sells the result: less owner chaos, more control, more booked income.</h2>
          <p className="muted">
            Ferocity should not feel like another dashboard to babysit. AI watches the business,
            prepares the work, connects the tools, and tells the owner what matters before money or time slips away.
          </p>
          <div className="grid section-actions">
            {frontAndCenter.map(([name, body]) => (
              <article className="panel span-4" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">What it does</p>
          <h2>Your business already has software. Ferocity is the AI employee that makes the work move.</h2>
          <p className="muted">
            Ferocity is not just a CRM, SEO tool, scheduling app, or chatbot. It connects demand, lead response,
            follow-up, jobs or orders, payments, reviews, proof, and reporting so owners can see what needs action now.
            It works for contractors and also for practices, agencies, sales teams, e-commerce, rental-connected owners,
            and owners with one business or several ventures.
          </p>
          <div className="grid section-actions">
            {fiveOutcomes.map(([name, body]) => (
              <article className="panel span-4" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Who it is for</p>
          <h2>For owners with one business, several ventures, or a growing operation.</h2>
          <p className="muted">
            Ferocity should feel approachable for a normal owner and serious enough for a multimillion-dollar company. One business,
            several ventures, or a growing team can each stay separate while the owner gets one clear command center for what matters.
            Rental-specific workflows are best handled with a dedicated rental system, with Ferocity acting as the owner command and follow-up layer when connected.
          </p>
          <div className="grid section-actions">
            {companyTypes.map(([name, body]) => (
              <article className="panel span-3" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">AI workforce</p>
          <h2>Hire AI before you hire more staff.</h2>
          <p className="muted">
            Ferocity supports the people already in the business. It helps existing teams work faster, gives solo owners leverage before hiring too early,
            and lets growing businesses reduce repetitive admin work without losing control.
          </p>
          <div className="grid section-actions">
            {businessSystems.map(([name, body]) => (
              <article className="panel span-4" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Connected business</p>
          <h2>Connect the website, marketing, payments, and daily work so revenue does not disappear between tools.</h2>
          <p className="muted">
            The point is not another disconnected app. Ferocity should know where leads came from, what happened next,
            who followed up, what got paid, what proof was collected, and what the owner should do now.
          </p>
          <div className="grid section-actions">
            {connectedTools.map(([name, body]) => (
              <article className="panel span-4" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">What Ferocity actually does</p>
          <h2>Connect the business once. Let Ferocity keep finding the next money-making action.</h2>
          <div className="feature-loop">
            {autopilotSteps.map(([number, title, body]) => (
              <article key={title}>
                <span>{number}</span>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">Run the free audit</Link>
            <Link className="button secondary-button" href="/start?source=home_autopilot">Set up my autopilot</Link>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Owner stays in control</p>
          <h2>Autopilot does not mean giving up control.</h2>
          <p className="muted">
            Ferocity is built so the owner decides which parts AI helps run. Some work can be prepared automatically,
            some can wait for approval, and some stays manual until the business is ready.
          </p>
          <div className="grid section-actions">
            {controlPromises.map(([name, body]) => (
              <article className="panel span-3" key={name}>
                <h3>{name}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="video-tour">
          <div className="video-frame" aria-label="Ferocity walkthrough preview">
            <div className="video-screen">
              <PlayCircle size={54} />
              <strong>Ferocity AI autopilot in 90 seconds</strong>
              <span>Find leaks. Follow up. Book income. Keep control.</span>
            </div>
            <div className="video-timeline">
              {walkthroughSteps.map(([number, title, body]) => (
                <div key={title}>
                  <b>{number}</b>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="video-copy">
            <p className="eyebrow">Watch first</p>
            <h2>The short version: Ferocity finds leaks, sets up the operating loop, and gives the business digital employees for repeat work.</h2>
            <p>
              Start with a free business audit. Then Ferocity can set up the business account, track lead sources, prepare follow-up,
              organize jobs and invoices, request reviews, create marketing proof, and report which work produced revenue.
            </p>
            <div className="button-row">
              <Link className="button" href="/demo">
                Open demo
              </Link>
              <Link className="button secondary-button" href="/demo/tour">
                Guided tour
              </Link>
            </div>
          </div>
        </section>

        <section className="public-grid">
          <div className="panel value-card">
            <MessageSquareText size={20} />
            <h2>Catch leads fast</h2>
            <p className="muted">New leads, missed callbacks, quote requests, and unanswered conversations stay visible until handled.</p>
          </div>
          <div className="panel value-card">
            <Sparkles size={20} />
            <h2>Build useful marketing</h2>
            <p className="muted">Service pages, GBP ideas, review flows, and content drafts tie back to real services and lead capture.</p>
          </div>
          <div className="panel value-card">
            <CheckCircle2 size={20} />
            <h2>Keep control</h2>
            <p className="muted">Customer messages, publishing, connected accounts, and ad changes stay behind clear owner controls.</p>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start path</p>
            <h2>Start free. Upgrade when you want Ferocity helping you get your life back.</h2>
            <p>Use the free grader to see what is leaking money and attention. Use a plan when you want Ferocity to help run follow-up, jobs, payments, reviews, marketing, and the growth loop.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/start?source=home_bottom">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
