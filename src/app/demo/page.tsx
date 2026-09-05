import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FeaturedDemoMedia } from "@/components/public/FeaturedDemoMedia";
import { BusinessLoopDemo } from "@/components/public/BusinessLoopDemo";
import { PublicCommandStory } from "@/components/public/PublicCommandStory";
import { getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity Demo | Watch the AI Business Operating System Think",
  description:
    "See one shared Business Brain coordinate people, AI employees, departments, and providers from the first conversation through future growth.",
  alternates: { canonical: "/demo" }
};

const loop = ["Remember", "Watch", "Understand", "Decide", "Coordinate", "Act", "Verify", "Continue"];

const intelligence = [
  ["Reputation and retention", "Reviews, referrals, memberships, reminders, reactivation, and customer-lifetime campaigns."],
  ["Search and content", "SEO, GEO, legitimate authority building, content, images, and video generation grounded in real proof."],
  ["Campaign intelligence", "Offers, creative variants, channel plans, managed budgets, and source-to-paid-revenue measurement."],
  ["Owner intelligence", "The Business Brain, Daily Briefs, reports, profit leaks, risks, approvals, and operational monitoring."]
];

export default async function DemoPage() {
  const hero = await getPublicCopy("demo_hero");
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="hero-command demo-hero">
          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.headline}</h1>
            <p>{hero.body}</p>
            <div className="button-row">
              <Link className="button" href={hero.ctaHref}>
                {hero.ctaLabel} <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href={hero.secondaryCtaHref}>{hero.secondaryCtaLabel}</Link>
            </div>
          </div>

          <div className="video-frame">
            <FeaturedDemoMedia priority fallbackAlt="Animated Ferocity walkthrough showing the business noticing, coordinating, acting, and learning" />
          </div>
        </section>

        <BusinessLoopDemo />

        <PublicCommandStory />

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The handoffs stop breaking</p>
            <h2>The estimate knows what was promised on the call. The crew knows what was sold. The invoice knows what changed.</h2>
            <p>
              People and AI employees work from the same Business Brain instead of rebuilding the story at every step. Ferocity remembers what happened, notices meaningful change, advances authorized work, checks the result, and keeps the next department moving.
            </p>
          </div>
          <div className="demo-proof-flow">
            {loop.map((item) => <span key={item}>{item}</span>)}
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <h2>The customer conversation, connected</h2>
            <p className="muted">
              AI phone answering and voice conversations, website chat, texting, email, lead capture, qualification, long-term follow-up, estimating, booking, reminders, and customer history all share context.
            </p>
          </article>
          <article className="panel">
            <h2>The business operation, connected</h2>
            <p className="muted">
              Customers, jobs, dispatch, scheduling, crews, field work, inventory, purchasing, documents, invoicing, online payments, collections, job profit, and accounting records move as one operation.
            </p>
          </article>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">The outcome feeds the next decision</p>
          <h2>Completed work makes the entire business smarter.</h2>
          <div className="value-ladder">
            {intelligence.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">Authority without bottlenecks</p>
            <h2>The right work goes to the right worker—human or AI.</h2>
            <p>
              Assign work to a person, choose Draft only or Ask first for an AI employee, or authorize routine work to run automatically. Ferocity follows consent, spending, publishing, payment, and provider rules—and keeps every action traceable.
            </p>
          </div>
          <div className="notice-card">
            <CheckCircle2 size={20} />
            <div>
              <strong>Only real decisions interrupt the work</strong>
              <p className="muted">Exceptions, uncertainty, protected actions, and choices outside the rules go to the person with the authority and context to decide.</p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start with one problem</p>
            <h2>Give your people and AI workforce one system for what happens next.</h2>
            <p>Start with the free grader, compare the operating levels, or connect the organization now.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/start">
              Start Ferocity <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
