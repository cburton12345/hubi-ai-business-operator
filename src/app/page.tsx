import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, BellRing, CheckCircle2, CircleDollarSign, Megaphone, ShieldCheck, TimerReset } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "Ferocity | AI Operating System for Service Businesses",
  description:
    "Put your business on accelerated autopilot with one AI workforce for leads, follow-up, jobs, money, reviews, marketing, reminders, and daily owner decisions.",
  alternates: { canonical: "/" }
};

const commandCards = [
  ["Lead waiting", "New quote request needs a reply.", "Draft reply"],
  ["Estimate aging", "$28k in viewed estimates need follow-up.", "Queue reminders"],
  ["Money due", "Two invoices need attention.", "Prepare reminder"],
  ["Review ready", "Completed jobs can become reviews and marketing.", "Create drafts"]
];

const workFerocityHandles = [
  "Handle routine calls, customer questions, scheduling, and important owner handoffs with context",
  "Follow up with leads before they go cold",
  "Track jobs, bids, estimates, materials, tasks, and reminders",
  "Prepare invoices, payment reminders, and collection follow-up",
  "Turn reviews, photos, and finished work into new marketing",
  "Build SEO, ad, content, and campaign drafts from real business data",
  "Show what needs attention, what needs approval, and where money is waiting"
];

const businessAreas = [
  "Leads",
  "Jobs",
  "Money",
  "Reviews",
  "Marketing",
  "Team",
  "Tasks",
  "Reports"
];

const promises = [
  {
    title: "Win more work",
    body: "Respond faster, follow up longer, recover aging estimates, and keep good leads from disappearing when the day gets busy.",
    icon: TimerReset
  },
  {
    title: "Stop profit leaks",
    body: "Keep jobs, receipts, invoices, overdue money, customer promises, and next actions connected instead of scattered across memory and apps.",
    icon: Megaphone
  },
  {
    title: "Get your time back",
    body: "Let Ferocity prepare or handle approved repeat work while you stay in control of customer messages, spending, publishing, and important decisions.",
    icon: ShieldCheck
  }
];

const powerLines = [
  "Connected AI receptionist",
  "AI sales follow-up",
  "AI office manager",
  "AI marketing team",
  "AI collections helper",
  "AI daily briefing"
];

export default function HomePage() {
  return (
    <main className="public-page public-home">
      <section className="public-shell">
        <PublicNav />

        <section className="hero-command">
          <div className="hero-copy">
            <p className="eyebrow">AI operating system for service businesses</p>
            <h1>Win more work. Lose less money. Get your life back.</h1>
            <p>
              Ferocity follows up with leads, keeps jobs moving, tracks money, builds customer trust,
              and handles approved routine office work—so the business runs without everything depending on you.
            </p>
            <div className="button-row">
              <Link className="button" href="/subscribe?plan=growth">
                Start Ferocity <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/demo">See it work</Link>
            </div>
            <div className="trust-strip" aria-label="Ferocity buying assurances">
              <span><ShieldCheck size={15} /> Secure Stripe checkout</span>
              <span><CheckCircle2 size={15} /> You choose what AI may do</span>
              <span><CircleDollarSign size={15} /> No surprise provider spending</span>
            </div>
          </div>

          <div className="product-console" aria-label="Ferocity command center sample">
            <div className="console-topbar">
              <div>
                <span className="eyebrow">Sample view</span>
                <strong>What needs attention today</strong>
              </div>
              <span className="live-pill">Demo data</span>
            </div>
            <div className="preview-metrics console-metrics">
              <div className="preview-metric tone-hot"><span>Replies</span><strong>6</strong><small>due today</small></div>
              <div className="preview-metric tone-money"><span>Pipeline</span><strong>$84k</strong><small>open work</small></div>
              <div className="preview-metric tone-draft"><span>Invoices</span><strong>$9.8k</strong><small>follow-up due</small></div>
              <div className="preview-metric tone-trust"><span>Reviews</span><strong>12</strong><small>ready to ask</small></div>
            </div>
            <div className="demo-alert-list">
              {commandCards.map(([title, body, action]) => (
                <div key={title}>
                  <BellRing size={16} />
                  <strong>{title}</strong>
                  <span>{body}</span>
                  <em>{action}</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="video-tour">
          <div className="video-frame">
            <Image
              className="walkthrough-animation"
              src="/ferocity-demo-walkthrough.svg"
              width={1280}
              height={720}
              priority
              unoptimized
              alt="Animated Ferocity walkthrough showing lead replies, estimates, invoices, reviews, and the business loop"
            />
          </div>
          <div className="video-copy">
            <p className="eyebrow">Watch Ferocity work</p>
            <h2>See scattered work become a clear action plan.</h2>
            <p>
              The core idea is simple: Ferocity watches what is waiting, prepares the work,
              and keeps you in control of what gets sent, posted, charged, or changed.
            </p>
            <Link className="button" href="/demo">
              Open full demo <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="public-grid">
          {promises.map((promise) => {
            const Icon = promise.icon;
            return (
              <article className="panel value-card" key={promise.title}>
                <Icon size={20} />
                <h2>{promise.title}</h2>
                <p className="muted">{promise.body}</p>
              </article>
            );
          })}
        </section>

        <section className="panel outcome-band">
          <div>
            <p className="eyebrow">One place for the operating day</p>
            <h2>Capture the lead. Win the job. Do the work. Get paid. Earn the next customer.</h2>
            <p className="muted">
              Ferocity connects the entire customer and job lifecycle so every finished step can trigger the right next step.
            </p>
          </div>
          <div className="demo-proof-flow compact-proof-flow" aria-label="Business areas Ferocity supports">
            {businessAreas.map((area) => <span key={area}>{area}</span>)}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">What makes it different</p>
            <h2>Ferocity is not another dashboard. It is an AI workforce.</h2>
            <p>
              It can answer faster, follow up longer, remind the right person, draft the message,
              track the money, turn completed work into marketing, and tell you what needs your decision.
              Because every department shares the same business context, the whole system can work together.
            </p>
          </div>
          <div className="demo-proof-flow">
            {powerLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <h2>What you can ask Ferocity to handle</h2>
            <ul className="plain-list">
              {workFerocityHandles.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Start with one problem. Add power when you want it.</h2>
              <p className="muted">
              You do not need every integration on day one. Start with the free grader, job tracking,
              follow-up, growth, or daily owner control. Connect website forms, email, payments, ads,
              calendars, or publishing when that next step matters.
            </p>
            <p className="muted">
              Customer messages, public posts, payment requests, and ad spend stay controlled by your setup rules.
            </p>
          </article>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The loop</p>
            <h2>Set up the machine. Capture demand. Follow up. Do the work. Get paid. Grow.</h2>
            <p>
              Ferocity connects the business instead of leaving work scattered across notes, inboxes, spreadsheets,
              websites, ad accounts, and memory.
            </p>
          </div>
          <div className="notice-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Honest automation</strong>
              <p className="muted">Ferocity prepares and automates approved work. Connected accounts are clearly labeled.</p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">First step</p>
            <h2>See what Ferocity can take off your plate first.</h2>
            <p>Run the free grader, then choose what you want Ferocity to watch, prepare, remind, or automate.</p>
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
