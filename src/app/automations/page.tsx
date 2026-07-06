import Link from "next/link";
import type { Metadata } from "next";
import { BellRing, CalendarClock, FileCheck2, MailCheck, Megaphone, MessageSquareReply, ShieldCheck, Star } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Business Automations for Leads, Reviews, Estimates, and Invoices",
  description:
    "Ferocity AI automations help businesses respond to leads, recover stale opportunities, follow up on estimates and invoices, request reviews, and keep important work visible.",
  alternates: {
    canonical: "/automations"
  }
};

const automationGroups = [
  {
    title: "Lead response",
    body: "Reply faster to new leads, missed calls, quote requests, marketplace inquiries, and partner inquiries.",
    items: ["Speed-to-lead draft", "Unanswered lead alert", "Callback reminder", "Stale lead recovery"],
    icon: MessageSquareReply
  },
  {
    title: "Estimates and invoices",
    body: "Keep open estimates and unpaid invoices from slipping through the cracks.",
    items: ["Estimate follow-up", "Viewed estimate reminder", "Invoice follow-up", "Won/lost tracking"],
    icon: FileCheck2
  },
  {
    title: "Reviews and reputation",
    body: "Ask at the right time, route unhappy feedback first, and draft review responses.",
    items: ["Review request after job", "Negative-experience interception", "Review response draft", "Google profile workflow"],
    icon: Star
  },
  {
    title: "Scheduling",
    body: "Help the team see callbacks, appointments, service jobs, and missed follow-up.",
    items: ["Callback scheduling", "Appointment reminders", "Technician schedule visibility", "Calendar connection status"],
    icon: CalendarClock
  },
  {
    title: "Marketing and SEO",
    body: "Create useful marketing drafts without auto-publishing thin content.",
    items: ["Service page draft", "GBP post draft", "Blog/content idea", "SEO refresh suggestion"],
    icon: Megaphone
  },
  {
    title: "Operator alerts",
    body: "Surface problems before they become lost revenue.",
    items: ["Stale lead alert", "Ignored estimate alert", "Overdue invoice alert", "Drop in lead flow"],
    icon: BellRing
  }
];

export default function AutomationsPage() {
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
            <Link href="/features">Features</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/about">About</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/install">Install App</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">AI automations</p>
          <h1>Ferocity watches the business and prepares the next action.</h1>
          <p className="muted">
            AI agents can monitor leads, estimates, invoices, reviews, jobs, marketing, and owner alerts. They prepare the work,
            then the business controls what sends, publishes, syncs, or spends.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=automations">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/business-health-score">
              Run free grader
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
            <Link className="button secondary-button" href="/demo/tour">
              Take the tour
            </Link>
          </div>
        </section>

        <section className="public-grid">
          {automationGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div className="panel" key={group.title}>
                <Icon size={20} />
                <h2>{group.title}</h2>
                <p className="muted">{group.body}</p>
                <ul className="plain-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Automation without losing control</h2>
              <p className="muted">
                Ferocity creates the draft, shows the next action, and logs what changed. Customer messages, public publishing,
                connected-account sync, payments, and ad spend stay behind the right permissions, consent rules, and plan controls.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/start?source=automations_safe">
              Get plan
            </Link>
            <Link className="mini-button secondary-button" href="/pricing">
              Compare plans
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Email, App Alerts, And Connected Tools</h2>
              <p className="muted">
                Ferocity is built to work with trusted tools for email, app alerts, calendars, payments, websites, and publishing. Businesses can
                use managed connection paths or bring their own accounts as their plan and usage grow.
              </p>
            </div>
            <MailCheck size={22} />
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/start?source=automations_tools">
              Request setup
            </Link>
            <Link className="mini-button secondary-button" href="/pricing">
              See tiers
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
