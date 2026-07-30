import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Megaphone,
  MessageSquareText,
  Wrench
} from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "Ferocity Features | AI Workforce for Business",
  description:
    "Ferocity gives businesses an AI workforce for leads, follow-up, jobs, payments, reviews, marketing, daily priorities, and approved automation.",
  alternates: { canonical: "/features" }
};

const features = [
  {
    title: "Lead follow-up",
    icon: MessageSquareText,
    body: "Capture leads, draft replies, remind you to call back, and keep old leads from disappearing."
  },
  {
    title: "Jobs and daily work",
    icon: Wrench,
    body: "Track jobs, bids, tasks, materials, workers, receipts, notes, and evidence-backed Job Health risks without adding another complicated field system."
  },
  {
    title: "AI estimates and takeoffs",
    icon: ClipboardList,
    body: "Prepare estimates, material lists, labor assumptions, overhead, payment terms, and customer-safe bid views."
  },
  {
    title: "Payments and invoices",
    icon: CircleDollarSign,
    body: "Create invoices, record payments, track money due, prepare reminders, and offer secure online checkout after the business connects Stripe payouts."
  },
  {
    title: "Turn finished work into trust",
    icon: CheckCircle2,
    body: "Turn finished work into proof, reviews, case studies, FAQs, posts, website trust, video scripts, linkable assets, and legitimate backlink opportunities."
  },
  {
    title: "Marketing and growth",
    icon: Megaphone,
    body: "Build qualification funnels, appointment follow-up, SEO drafts, ad and video packages, and a source-to-booked-work-to-revenue feedback loop."
  },
  {
    title: "Know what needs attention",
    icon: Bot,
    body: "Ask what needs attention, what AI handled, what needs approval, and what to do next."
  },
  {
    title: "AI Office Manager",
    icon: CalendarClock,
    body: "Handle routine calls, screen important ones, explain why a caller needs you, and protect your time while keeping customer service moving."
  }
];

const status = [
  ["Works immediately", "Customers, leads, jobs, estimates, materials, invoices, reports, reminders, AI drafts, and the installable app."],
  ["Personalize during setup", "Your services, business details, team access, payment terms, approval choices, and brand voice."],
  ["Connect when useful", "Online checkout, provider-sent email or SMS, AI phone agents, premium video rendering, and outside publishing."],
  ["You stay in control", "Keep work as drafts, approve important actions, or allow safe repeat work after consent, limits, and cost checks."]
];

const engines = [
  ["Remembers how you work", "Save a choice for the business, a workflow, or a customer, then change it for one action without leaving the task."],
  ["Qualified lead and show-up loop", "Audits, quizzes, active qualification forms, follow-up sequences, booked appointments, timed reminders, and revenue feedback."],
  ["Authority and Link Intelligence", "Completed jobs become proof, reviews, case studies, linkable assets, earned-link opportunities, website updates, and video briefs."],
  ["SEO and AI-search growth", "Website analysis, service pages, local content, GBP ideas, community topics, and search visibility tracking."],
  ["Ad and video creative", "Platform-specific hooks, ad variants, short-video scripts, scene plans, voiceover drafts, and provider-ready briefs."],
  ["Simple operations and Job Health", "Customers, bids, AI estimates, materials, jobs, field notes, receipts, invoices, payments, and explainable job-risk checks."],
  ["Owner command", "Daily briefing, risks, money waiting, approvals, AI actions, and what needs attention now."],
  ["AI Office Manager", "Customer service, scheduling, follow-up, collections, intelligent call screening, and contextual handoffs while keeping the business number customers already know."],
  ["Connected systems", "Website, marketplace sources, payment tools, email, SMS, voice, video, ads, calendars, and BYO providers through controlled integrations."]
];

const ownerOutcomes = [
  ["Get found", "Business grader, SEO/GEO drafts, Google profile ideas, proof capture, reviews, funnels, ads, and campaign planning."],
  ["Catch the lead", "Forms, quote links, source tracking, lead scoring, urgent lead alerts, and first-response drafts."],
  ["Win the job", "Follow-up, estimates, material takeoffs, customer-safe bid views, reminders, and pipeline visibility."],
  ["Run the day", "Jobs, tasks, worker plans, receipts, field proof, payroll review, and owner briefing."],
  ["Get paid", "Invoices, payment records, overdue reminders, job profit, expenses, and money waiting for attention."],
  ["Improve the machine", "Reports, AI recommendations, automation timeline, lead-source ROI, and review-ready growth actions."]
];

export default function FeaturesPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero features-hero">
          <p className="eyebrow">Features</p>
            <h1>Everything your service business needs to win, run, and grow work.</h1>
          <p className="muted">
            Ferocity can start as a simple tracker or become the command center for qualified leads,
            follow-up, jobs, payments, reviews, SEO, ads, video briefs, team visibility, and daily decisions.
          </p>
          <div className="button-row">
            <Link className="button" href="/subscribe?plan=growth">
              Start Ferocity <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/demo">See it work</Link>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">What it helps you do</p>
          <h2>Ferocity is organized around outcomes, not software menus.</h2>
          <div className="value-ladder">
            {ownerOutcomes.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid section-actions">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="panel span-4" key={feature.title}>
                <Icon size={20} />
                <h2>{feature.title}</h2>
                <p className="muted">{feature.body}</p>
              </article>
            );
          })}
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">What Ferocity is built to run</p>
          <h2>One system. Multiple engines.</h2>
          <div className="value-ladder">
            {engines.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">Two ways to use it</p>
            <h2>Let AI guide you, or use the tools directly.</h2>
            <p>
              Normal users can tell Ferocity what they want done. Power users can still open leads,
              jobs, invoices, marketing, settings, integrations, and reports directly.
            </p>
          </div>
          <div className="notice-card">
            <CalendarClock size={20} />
            <div>
              <strong>Built for daily use</strong>
              <p className="muted">Open it, see what matters, handle the exceptions, and let authorized routine work keep moving.</p>
            </div>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Start with what matters</p>
          <h2>Use the core immediately. Connect outside services when you want them.</h2>
          <div className="value-ladder">
            {status.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>See what Ferocity can handle first.</h2>
            <p>Run the free grader, then choose the plan that fits the amount of help you want.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/subscribe?plan=growth">
              Start Ferocity <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
