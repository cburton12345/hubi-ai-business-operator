import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Ferocity Demo | See the AI Business Loop",
  description:
    "See how Ferocity helps businesses set up growth, catch leads, follow up, run work, collect money, request reviews, and keep owners focused.",
  alternates: { canonical: "/demo" }
};

const sampleActions = [
  ["Reply", "6 leads need a response today"],
  ["Show up", "Booked jobs get confirmation and timed reminder work"],
  ["Follow up", "$28k in estimates are waiting"],
  ["Collect", "$9.8k is overdue"],
  ["Protect jobs", "Schedule, cost, material, change, and safety risks are explained"],
  ["Grow", "Finished work becomes proof, content, reviews, and legitimate link opportunities"]
];

const loop = ["AI setup", "Create demand", "Qualify", "Book", "Improve show-up", "Win and do the work", "Get paid", "Feed revenue back"];

const engines = [
  ["Find demand", "Audit gaps, SEO targets, reviews, community questions, ads, and offers."],
  ["Qualify leads", "Use forms, questions, source tracking, urgency, service area, and fit."],
  ["Move work forward", "Prepare replies, booked-appointment reminders, estimates, jobs, invoices, and daily tasks."],
  ["Protect the job", "Explain schedule, cost, material, change, safety, and missing-information risks with evidence."],
  ["Improve the system", "Feed booked work, sales, payments, proof, reviews, and real referral revenue back into growth decisions."]
];

export default function DemoPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/features">Features</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="hero-command demo-hero">
          <div className="hero-copy">
            <p className="eyebrow">Product demo</p>
            <h1>See the business machine Ferocity helps build.</h1>
            <p>
              First Ferocity helps set up the growth and operations loop. Then it watches the queue,
              prepares the next move, and keeps important decisions in front of the owner.
            </p>
            <div className="button-row">
              <Link className="button" href="/business-health-score">
                Run free grader <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href="/start?source=demo">Start setup</Link>
            </div>
          </div>

          <div className="video-frame">
            <Image
              className="walkthrough-animation"
              src="/ferocity-demo-walkthrough.svg"
              width={1280}
              height={720}
              priority
              unoptimized
              alt="Animated Ferocity walkthrough showing the work queue, approvals, and business loop"
            />
          </div>
        </section>

        <section className="public-grid">
          {sampleActions.map(([action, detail]) => (
            <article className="panel value-card" key={action}>
              <CheckCircle2 size={18} />
              <h2>{action}</h2>
              <p className="muted">{detail}</p>
            </article>
          ))}
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">The engine</p>
          <h2>The demo starts before the lead comes in.</h2>
          <p className="muted">
            Ferocity can help set up the website path, lead source tracking, follow-up rules, proof capture,
            reviews, SEO/GEO drafts, and campaign ideas before traffic arrives.
          </p>
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
            <p className="eyebrow">How it works</p>
            <h2>Ferocity connects the full loop, then keeps it moving.</h2>
            <p>
              You choose what AI can help with and what it may do automatically. Ferocity keeps protected actions controlled,
              tracks what happened, and shows what needs attention next. The result is fewer missed steps
              and a business that feels more under control.
            </p>
          </div>
          <div className="demo-proof-flow">
            {loop.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <h2>What can be automated</h2>
            <p className="muted">
              Lead replies, callbacks, old-lead recovery, appointment reminders, estimates, material lists, invoice reminders,
              review requests, Job Health checks, link monitoring, SEO/GEO drafts, ad and video briefs, and daily work lists.
            </p>
          </article>
          <article className="panel">
            <h2>What stays controlled</h2>
            <p className="muted">
              Customer sends, public posts, payment requests, ad spend, publishing, and connected accounts follow the authority and spending rules you choose.
            </p>
          </article>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Try it</p>
            <h2>Start with the free grader.</h2>
            <p>It shows what Ferocity can take off your plate first.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Grade my business free <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
