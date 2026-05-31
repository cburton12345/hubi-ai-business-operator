import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, ChartNoAxesCombined, CheckCircle2, Clock3, FileText, Megaphone, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

const operatorCards = [
  { label: "New leads", value: "18", note: "6 need fast reply", tone: "hot" },
  { label: "Pipeline", value: "$84k", note: "open value", tone: "money" },
  { label: "Reviews", value: "12", note: "requests queued", tone: "trust" },
  { label: "SEO pages", value: "34", note: "drafts in review", tone: "draft" }
];

const actionQueue = [
  "Reply to 3 storm leads before they go cold",
  "Follow up on 5 viewed estimates",
  "Ask 4 completed jobs for reviews",
  "Refresh 8 city/service pages with real job proof"
];

const consoleTabs = ["Today", "Leads", "Growth", "Jobs"];

const pipelineRows = [
  ["Storm leads", "$42k", "high"],
  ["Repair estimates", "$28k", "medium"],
  ["Review asks", "12", "low"]
];

const leaks = [
  ["Leads arrive", "but nobody replies fast enough."],
  ["Estimates go out", "but follow-up is inconsistent."],
  ["Jobs finish", "but reviews are not requested."],
  ["Marketing runs", "but revenue is not traced back."]
];

const setupTracks = [
  {
    title: "Get found",
    body: "Useful service pages, city targets, review flow, GBP activity, and source tracking.",
    icon: Megaphone
  },
  {
    title: "Win the lead",
    body: "Lead capture, suggested replies, missed callback alerts, pipeline stages, and task ownership.",
    icon: MessageSquareText
  },
  {
    title: "Do the work",
    body: "Jobs, estimates, invoices, appointment reminders, customer history, and service visibility.",
    icon: FileText
  },
  {
    title: "Keep momentum",
    body: "Stale lead recovery, estimate follow-up, invoice nudges, review requests, and operator alerts.",
    icon: CalendarClock
  }
];

const verticals = [
  "Roofing and storm work",
  "Trailer and equipment rentals",
  "Cleaning and home services",
  "HVAC, plumbing, electrical",
  "Local contractors",
  "Multi-brand operators"
];

const setupExamples = [
  "I run a roofing company and want storm leads.",
  "Set up missed-call text back and stale lead recovery.",
  "Build review requests after completed jobs.",
  "Help me make SEO pages without auto-publishing junk."
];

export default function HomePage() {
  return (
    <main className="public-page public-home">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/about">About</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/start">Start</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </nav>

        <section className="hero-command">
          <div className="hero-copy">
            <p className="eyebrow">For service businesses</p>
            <h1>Stop losing jobs between marketing, follow-up, and operations.</h1>
            <p>
              Ferocity helps a business keep SEO, reviews, leads, estimates, jobs, invoices, reminders, and revenue tracking in one place.
            </p>
            <div className="button-row">
              <Link className="button" href="/demo">
                See the demo <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/start?source=home">
                Start my setup
              </Link>
              <Link className="button secondary-button" href="/automations">
                View automations
              </Link>
            </div>
            <div className="trust-strip" aria-label="Safety controls">
              <span><ShieldCheck size={15} /> Approval first</span>
              <span><Clock3 size={15} /> Fast follow-up</span>
              <span><ChartNoAxesCombined size={15} /> Revenue tracking</span>
            </div>
          </div>

          <div className="product-console" aria-label="Ferocity command center preview">
            <div className="console-topbar">
              <div>
                <span className="eyebrow">Ferocity Console</span>
                <strong>Beta Roofing Co</strong>
              </div>
              <span className="live-pill">Setup-safe</span>
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
                  <h2><BellRing size={18} /> Needs attention</h2>
                  <small>Owner view</small>
                </div>
                <ul className="action-stack">
                  {actionQueue.map((item) => (
                    <li key={item}><span />{item}</li>
                  ))}
                </ul>
              </section>
              <section className="console-panel">
                <div className="console-heading">
                  <h2><Sparkles size={18} /> Setup plan</h2>
                  <small>Preview only</small>
                </div>
                <div className="recommend-card">
                  <strong>Recover storm leads first</strong>
                  <p>Draft replies, schedule callbacks, and keep customer messages in review.</p>
                  <Link href="/demo/tour">View workflow</Link>
                </div>
              </section>
            </div>
            <div className="console-pipeline">
              <div className="console-heading">
                <h2><ChartNoAxesCombined size={18} /> Revenue and growth loop</h2>
                <small>Source to money</small>
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

        <section className="outcome-band">
          <div>
            <p className="eyebrow">One connected system</p>
            <h2>Marketing is only valuable when it becomes booked work.</h2>
          </div>
          <p>
            Ferocity connects SEO, reviews, forms, ads, conversations, estimates, jobs, invoices, and follow-up so the business sees what is working and what is leaking money.
          </p>
        </section>

        <section className="leak-board">
          <div className="leak-copy">
            <p className="eyebrow">The problem</p>
            <h2>Most local businesses are not losing because they lack effort. They are leaking.</h2>
            <p>
              Ferocity is built around the messy handoffs that usually kill growth: the lead that sits too long, the estimate nobody follows up on, the happy customer never asked for a review, the campaign nobody ties to booked revenue.
            </p>
          </div>
          <div className="leak-list">
            {leaks.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="operator-system">
          <div className="section-heading">
            <p className="eyebrow">What Ferocity organizes</p>
            <h2>Not random tools. Clear work from lead to paid job.</h2>
          </div>
          <div className="system-track">
            {setupTracks.map((track, index) => {
              const Icon = track.icon;
              return (
                <article key={track.title}>
                  <div>
                    <span>{index + 1}</span>
                    <Icon size={20} />
                  </div>
                  <h3>{track.title}</h3>
                  <p>{track.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="ai-setup-showcase">
          <div className="setup-chat-preview">
            <div className="preview-topline">
              <div>
                <span className="eyebrow">Build My System</span>
                <strong>Tell Ferocity what you need in normal words.</strong>
              </div>
              <span className="live-pill">Preview first</span>
            </div>
            <div className="prompt-box">I run a roofing company and want storm leads, reviews, SEO pages, and fast follow-up.</div>
            <div className="setup-plan-mini">
                <strong>Ferocity sets up:</strong>
              <ul>
                <li>Storm lead intake and source tracking</li>
                <li>Speed-to-lead reply drafts and callback reminders</li>
                <li>Review request workflow after completed work</li>
                <li>Draft-only service and city page plan</li>
              </ul>
            </div>
          </div>
          <div className="setup-copy">
            <p className="eyebrow">The simple setup path</p>
            <h2>No giant software maze for the owner to configure.</h2>
            <p>
              Ferocity keeps detailed settings available, but the main path is simple: say what you need, review the checklist, then apply the setup.
            </p>
            <div className="setup-safety-row">
              <span>Preview changes</span>
              <span>Apply reviewed setup</span>
              <span>Log what changed</span>
              <span>Keep customer actions controlled</span>
            </div>
            <div className="example-prompts">
              {setupExamples.map((item) => (
                <span key={item}>{item}</span>
              ))}
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
            <p className="muted">Customer messages, publishing, connected accounts, and ad changes stay under review and approval.</p>
          </div>
        </section>

        <section className="vertical-band">
          <div>
            <p className="eyebrow">Built for real service businesses</p>
            <h2>Start simple, then turn on more when the business needs it.</h2>
            <p>
              Some companies only want follow-up automations. Some want SEO and reviews. Some want leads, jobs, invoices, and reporting together.
            </p>
          </div>
          <ul>
            {verticals.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">See it safely</p>
            <h2>Show the demo publicly. Keep the real dashboard private.</h2>
            <p>Public pages explain the system. Real leads, settings, automations, billing, and workspace data stay behind sign-in.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/demo">
              Open demo <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/start?source=home_bottom">
              Request setup
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
