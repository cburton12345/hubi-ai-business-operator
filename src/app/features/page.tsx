import Link from "next/link";
import {
  Bot,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  FileText,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  Star,
  Wrench
} from "lucide-react";

const marketplaceProUrl = "https://marketplacepro.live";

const sections = [
  {
    group: "Growth",
    title: "Get more leads",
    body: "Plan local SEO, service pages, review flow, GBP activity, referral/community ideas, and campaign tracking.",
    examples: ["Service page drafts", "Location page planning", "GBP post drafts", "Source tracking"],
    icon: Megaphone
  },
  {
    group: "Sales",
    title: "Respond faster",
    body: "Turn new leads, missed calls, and quote requests into visible tasks and suggested replies.",
    examples: ["Speed-to-lead draft", "Unanswered lead alert", "Conversation timeline", "Internal notes"],
    icon: MessageSquareText
  },
  {
    group: "Sales",
    title: "Automate follow-up",
    body: "Create reminders and drafts for the moments that usually get forgotten.",
    examples: ["Stale lead recovery", "Estimate follow-up", "Invoice follow-up", "Callback reminders"],
    icon: CalendarClock
  },
  {
    group: "Growth",
    title: "Build SEO safely",
    body: "Create useful, reviewable content plans that tie back to services, towns, jobs, and lead capture.",
    examples: ["Draft-first pages", "SEO refreshes", "Quality checks", "No thin auto-publishing"],
    icon: FileText
  },
  {
    group: "Proof",
    title: "Ask for reviews",
    body: "Create review request drafts after completed work and route unhappy feedback before a public ask.",
    examples: ["Review request workflow", "Negative-experience interception", "Response drafts", "Google profile workflow"],
    icon: Star
  },
  {
    group: "Proof",
    title: "Capture customer proof",
    body: "Collect approved testimonials, before/after links, customer stories, and consent after real jobs.",
    examples: ["Photo links", "Video links", "Consent tracking", "Proof-to-content drafts"],
    icon: CheckCircle2
  },
  {
    group: "Revenue",
    title: "Track revenue",
    body: "Connect marketing activity to leads, estimates, booked jobs, paid invoices, and reviews.",
    examples: ["Lead source ROI", "Pipeline value", "Closed revenue", "Campaign learning"],
    icon: ChartNoAxesCombined
  },
  {
    group: "Setup",
    title: "Configure with AI",
    body: "Let a business owner describe what they need in normal words, then review setup changes before applying.",
    examples: ["Build My System", "Preview changes", "Apply safely", "Change log"],
    icon: Bot
  },
  {
    group: "Control",
    title: "Keep control",
    body: "Customer messages, publishing, connected accounts, and spending stay under review.",
    examples: ["Usage limits", "Approval gates", "Audit logs", "Bring your own accounts"],
    icon: ShieldCheck
  }
];

const featureGroups = ["Setup", "Growth", "Sales", "Proof", "Revenue", "Control"].map((name) => ({
  name,
  items: sections.filter((section) => section.group === name)
}));

const operatingLoop = [
  {
    label: "Get found",
    text: "Plan SEO, service pages, reviews, GBP activity, referrals, community posts, and campaign tracking."
  },
  {
    label: "Catch the lead",
    text: (
      <>
        Bring forms, calls, messages, quote requests, and{" "}
        <Link className="inline-link" href={marketplaceProUrl}>
          MarketplacePro
        </Link>{" "}
        sources into one visible lead queue.
      </>
    )
  },
  {
    label: "Follow up",
    text: "Create suggested replies, callbacks, stale lead tasks, estimate reminders, and invoice follow-up."
  },
  {
    label: "Close the job",
    text: "Track pipeline stages, estimates, booked work, job status, revenue, reviews, and next best actions."
  }
];

const automationRows = [
  ["Speed-to-lead", "Draft a first reply and flag leads that need attention."],
  ["Missed callback", "Create a visible task when a callback or appointment is at risk."],
  ["Estimate follow-up", "Remind the team when an estimate sits too long without an answer."],
  ["Invoice follow-up", "Draft friendly payment reminders for review."],
  ["Review request", "Ask after completed work and route unhappy feedback through a safer path."],
  ["Customer proof", "Collect job photos, testimonials, and permissions before turning them into draft marketing."],
  ["SEO refresh", "Keep service and city content draft-first, useful, and tied to real work."]
];

const safetyRows = [
  "Customer messages, publishing, ad spend, sync, and public review replies stay controlled.",
  "Setup plans preview changes before anything is applied.",
  "Activity logs record what changed so admins can review or roll back setup work.",
  "Paid tiers control seats, usage, AI limits, connected-account features, and advanced automations."
];

export default function FeaturesPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/demo/tour">Tour</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero features-hero">
          <p className="eyebrow">What Ferocity can do</p>
          <h1>One place to manage leads, follow-up, reviews, jobs, and revenue.</h1>
          <p className="muted">
            Ferocity is built for local service businesses that need marketing, follow-up, reviews, estimates, jobs, and revenue
            tracking to work together without making the owner dig through disconnected tools.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=features">
              Start my setup
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
            <Link className="button secondary-button" href="/demo">
              See demo
            </Link>
          </div>
        </section>

        <section className="feature-command">
          <div>
            <p className="eyebrow">Plain-English setup</p>
            <h2>Ferocity does not make owners configure a pile of tools.</h2>
            <p className="muted">
              A business owner can start with normal words like "I run a roofing company and need storm leads, reviews, SEO pages,
              and fast follow-up." Ferocity turns that into a setup checklist with drafts, tasks, safety settings, and review steps.
            </p>
            <div className="button-row">
              <Link className="button" href="/start?source=features_setup">
                Start setup
              </Link>
              <Link className="button secondary-button" href="/pricing">
                Compare tiers
              </Link>
            </div>
          </div>
          <div className="feature-plan-card">
            <strong>Example setup plan</strong>
            <ul className="plain-list">
              <li>
                Set lead source tracking for SEO, GBP, referrals, paid campaigns, and{" "}
                <Link className="inline-link" href={marketplaceProUrl}>
                  MarketplacePro
                </Link>
                .
              </li>
              <li>Create service and city page drafts for review.</li>
              <li>Prepare speed-to-lead, stale lead, estimate, invoice, review, and customer proof workflows.</li>
              <li>Keep customer messages, publishing, ad spend, and sync under approval.</li>
            </ul>
          </div>
        </section>

        <section className="feature-loop">
          {operatingLoop.map((step, index) => (
            <article key={step.label}>
              <span>{index + 1}</span>
              <h2>{step.label}</h2>
              <p>{step.text}</p>
            </article>
          ))}
        </section>

        <section className="feature-split">
          <div className="panel">
            <h2>
              <Wrench size={19} /> Automations Ferocity organizes
            </h2>
            <div className="feature-automation-list">
              {automationRows.map(([name, text]) => (
                <div key={name}>
                  <CheckCircle2 size={17} />
                  <strong>{name}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>
              <ShieldCheck size={19} /> Control stays clear
            </h2>
            <ul className="plain-list safety-list">
              {safetyRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="feature-group-stack">
          {featureGroups.map((group) => (
            <article className="panel feature-group-panel" key={group.name}>
              <p className="eyebrow">{group.name}</p>
              <div className="feature-group-grid">
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div className="feature-mini-card" key={section.title}>
                      <Icon size={20} />
                      <h2>{section.title}</h2>
                      <p className="muted">{section.body}</p>
                      <ul className="plain-list">
                        {section.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Best single next step</p>
            <h2>Show the demo first. Use features as the deeper map.</h2>
            <p>
              The demo gives the quick walkthrough. This page lists the systems, automations, safety rules, and plan controls behind it.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/start?source=features_bottom">
              Start setup
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
