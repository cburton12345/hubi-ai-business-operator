import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BellRing, CheckCircle2, CircleDollarSign, Megaphone, ShieldCheck, TimerReset } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FeaturedDemoMedia } from "@/components/public/FeaturedDemoMedia";
import { PublicCommandStory } from "@/components/public/PublicCommandStory";
import { getFeaturedDemo, getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity AI | AI Operating System for Service Businesses",
  description:
    "Give your people and AI workforce one shared Business Brain that remembers, watches, decides what should happen next, and keeps authorized work moving.",
  alternates: { canonical: "/" }
};

const commandCards = [
  ["Ferocity noticed", "$28k in viewed estimates is losing momentum.", "Follow-up ready · watching"],
  ["Ferocity coordinated", "Rain changed tomorrow’s crew, customer, and material plan.", "New plan ready"],
  ["Ferocity completed", "Approved reminders went to two overdue customers.", "$9.8k protected"],
  ["Human decision", "A warranty request falls outside the organization’s standard policy.", "Review exception"]
];

const workFerocityHandles = [
  "Communicate: AI phone answering and voice conversations, website chat, texting, email, and customer history",
  "Win work: lead capture, qualification, follow-up, estimating, appointment booking, dispatch, and scheduling",
  "Run work: customers, jobs, crews, forms, time, documents, inventory, purchasing, and operational risk",
  "Manage money: pricing, proposals, invoices, online payments, collections, job profit, and accounting exports",
  "Compound growth: reviews, referrals, reactivation, SEO, GEO, content, images, video, and campaigns",
  "Know the business: the Business Brain, Daily Briefs, reports, profit leaks, and operational monitoring"
];

const businessAreas = [
  "Calls & conversations",
  "Leads & sales",
  "Jobs & field work",
  "Money & collections",
  "Customers & reputation",
  "Marketing & growth",
  "Team & operations",
  "Intelligence & reports"
];

const promises = [
  {
    title: "One Business Brain",
    body: "Human employees and AI employees work from the same memory of conversations, jobs, money, customers, operating rules, and decisions.",
    icon: TimerReset
  },
  {
    title: "One coordinated workforce",
    body: "Ferocity keeps people, AI agents, departments, and connected providers working from the same priorities instead of separate queues.",
    icon: Megaphone
  },
  {
    title: "Work keeps moving",
    body: "Ferocity keeps unfinished work visible, advances the next authorized move, verifies the result, and continues until the work is complete or a real decision is required.",
    icon: ShieldCheck
  }
];

const powerLines = [
  "Remember across departments",
  "Monitor for meaningful change",
  "Explain why it matters",
  "Decide what should happen next",
  "Complete authorized work",
  "Verify the result and continue"
];

export default async function HomePage() {
  const [featuredDemo, hero, finalCta] = await Promise.all([
    getFeaturedDemo(),
    getPublicCopy("home_hero"),
    getPublicCopy("home_final_cta")
  ]);
  return (
    <main className="public-page public-home">
      <section className="public-shell">
        <PublicNav />

        <section className="hero-command">
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
            <div className="trust-strip" aria-label="Ferocity buying assurances">
              <span><ShieldCheck size={15} /> Authorized work stays within your rules</span>
              <span><CheckCircle2 size={15} /> Every action remains traceable</span>
              <span><CircleDollarSign size={15} /> Provider spending stays controlled</span>
            </div>
          </div>

          <div className="product-console" aria-label="Ferocity command center sample">
            <div className="console-topbar">
              <div>
                <span className="eyebrow">Business awareness</span>
                <strong>What changed. What moved forward. Who needs to decide.</strong>
              </div>
              <span className="live-pill">Demo data</span>
            </div>
            <div className="preview-metrics console-metrics">
              <div className="preview-metric tone-hot"><span>Signals watched</span><strong>128</strong><small>across the business</small></div>
              <div className="preview-metric tone-money"><span>Work advanced</span><strong>17</strong><small>authorized actions</small></div>
              <div className="preview-metric tone-draft"><span>Value protected</span><strong>$37.8k</strong><small>opportunity + cash</small></div>
              <div className="preview-metric tone-trust"><span>Needs judgment</span><strong>1</strong><small>human decision</small></div>
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
            <FeaturedDemoMedia priority fallbackAlt="Animated Ferocity walkthrough showing lead replies, estimates, invoices, reviews, and the business loop" />
          </div>
          <div className="video-copy">
            <p className="eyebrow">{featuredDemo.eyebrow}</p>
            <h2>{featuredDemo.headline}</h2>
            <p>{featuredDemo.body}</p>
            <Link className="button" href={featuredDemo.ctaHref}>
              {featuredDemo.ctaLabel} <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <PublicCommandStory />

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
            <p className="eyebrow">One intelligence layer across the company</p>
            <h2>Every person, AI employee, and department can work from the same business context.</h2>
            <p className="muted">
              Calls, estimates, schedules, field updates, payments, customer outcomes, and growth results stay connected as work moves through the organization.
            </p>
          </div>
          <div className="demo-proof-flow compact-proof-flow" aria-label="Business areas Ferocity supports">
            {businessAreas.map((area) => <span key={area}>{area}</span>)}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">What makes it different</p>
            <h2>Most software gives each department another tool. Ferocity gives the whole business one intelligence layer.</h2>
            <p>
              A CRM stores records. A dashboard reports what happened. An automation runs one predefined trigger.
              Ferocity maintains the shared context, understands what matters now, coordinates human and AI work, and advances the next authorized action.
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
            <h2>One operating system. The whole business.</h2>
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
            <h2>You decide how your human and AI teams work together.</h2>
              <p className="muted">
              Assign work to a person, let Ferocity prepare it, require approval, or authorize routine actions to run automatically. Ferocity remembers the rule for each workflow, customer, location, and team.
            </p>
            <p className="muted">
              Override any decision in the moment without rebuilding the workflow or giving up control of customer communication, publishing, payments, or spending.
            </p>
          </article>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The Ferocity operating loop</p>
            <h2>Unfinished work never becomes invisible.</h2>
            <p>
              Ferocity keeps asking what should happen next. Every result updates the shared Business Brain, starts the next authorized move, and keeps leads, work, money, customers, and growth advancing until the work is complete or a real decision needs a person.
            </p>
          </div>
          <div className="notice-card">
            <ShieldCheck size={20} />
            <div>
              <strong>The right decision reaches the right person</strong>
              <p className="muted">Ferocity handles what fits the organization’s rules and routes exceptions, uncertainty, and protected decisions to whoever has the authority and context to decide.</p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">{finalCta.eyebrow}</p>
            <h2>{finalCta.headline}</h2>
            <p>{finalCta.body}</p>
          </div>
          <div className="button-row">
            <Link className="button" href={finalCta.ctaHref}>
              {finalCta.ctaLabel} <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href={finalCta.secondaryCtaHref}>{finalCta.secondaryCtaLabel}</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
