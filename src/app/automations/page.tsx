import Link from "next/link";
import type { Metadata } from "next";
import { BellRing, CalendarClock, FileCheck2, MailCheck, Megaphone, MessageSquareReply, ShieldCheck, Star } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

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
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">AI automations</p>
          <h1>Automations run steps. Ferocity stays responsible for what happens next.</h1>
          <p className="muted">
            Ferocity keeps shared context across leads, estimates, invoices, reviews, jobs, marketing, and owner decisions. It notices when a workflow stalls, coordinates the next authorized move, verifies the result, and keeps watching after a single trigger would have stopped.
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
                Ferocity prepares the draft, shows the next action, and logs what changed. Customer messages, public publishing,
                connected tools, payments, and ad spend stay behind the right permissions, consent rules, and plan controls.
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
                connect their own accounts or choose managed setup where available.
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

        <section className="panel section-actions">
          <p className="eyebrow">More than trigger-and-action</p>
          <h2>The workflow does not disappear after one step fires.</h2>
          <p className="muted">A traditional automation can send an email when a status changes. Ferocity can understand why the status matters, preserve the customer and job context, choose the allowed next step, detect a failed delivery, recover or escalate, and remember the outcome for the next decision.</p>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
