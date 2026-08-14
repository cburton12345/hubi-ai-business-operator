import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Megaphone,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FeaturedDemoMedia } from "@/components/public/FeaturedDemoMedia";
import { PublicCommandStory } from "@/components/public/PublicCommandStory";
import { getFeaturedDemo, getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity AI | The AI Operations Department for Your Business",
  description:
    "Ferocity keeps leads, work, customers, money, and growth moving across your business—and brings you only the decisions that need you.",
  alternates: { canonical: "/" }
};

const commandCards = [
  ["Ferocity noticed", "$28k in viewed estimates is losing momentum.", "Follow-up ready · watching"],
  ["Ferocity advanced", "Rain changed tomorrow’s crew, customer, and material plan.", "New plan ready"],
  ["Ferocity completed", "Approved reminders went to two overdue customers.", "$9.8k protected"],
  ["Human decision", "A warranty request falls outside the organization’s standard policy.", "Review exception"]
];

const activityTimeline = [
  ["7:18 AM", "New lead", "Ferocity responds, captures what they need, and gets the next step moving."],
  ["8:43 AM", "Estimate needs attention", "Ferocity keeps the authorized follow-up moving."],
  ["10:07 AM", "Customer replies", "Ferocity uses the conversation and business context to keep the work moving."],
  ["11:26 AM", "Team update", "The update becomes part of the job and Business Brain—not another disconnected conversation."],
  ["1:14 PM", "Money needs attention", "Ferocity keeps authorized payment follow-up moving."],
  ["2:52 PM", "Work completed", "Ferocity advances enabled next steps for payment, follow-up, reviews, referrals, and growth."],
  ["4:17 PM", "Outside the rules", "Ferocity knows this one needs a person."]
];

const capabilityAreas = [
  ["Calls & conversations", "Phone · Voice · Chat · Text · Email"],
  ["Leads & sales", "Capture · Qualification · Follow-up · Estimates · Proposals · Scheduling"],
  ["Jobs & operations", "Customers · Jobs · Teams · Time · Forms · Documents · Field updates · Purchasing"],
  ["Money", "Pricing · Invoices · Payments · Collections · Profitability"],
  ["Customers", "Communication · Reviews · Referrals · Reactivation · Reputation"],
  ["Marketing & growth", "Campaigns · Social · SEO · GEO · Content · Images · Video"],
  ["Intelligence", "Business Brain · Daily Briefs · Reports · Monitoring · Recommended actions"]
];

const controlModes = [
  ["Human handles it", "Assign it to a person.", UserRound],
  ["Ferocity prepares it", "Ferocity does the work; a person approves the protected action.", ShieldCheck],
  ["Ferocity handles it", "Authorized routine work happens automatically within your rules.", BrainCircuit]
] as const;

const operatingLoop = [
  "Notices",
  "Understands",
  "Determines the next move",
  "Advances authorized work",
  "Checks the result",
  "Updates the Business Brain"
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
            <p className="hero-deck">Meet the AI operations department that keeps it moving.</p>
            <p>{hero.body}</p>
            <p className="hero-outcome">Your business keeps moving—even when you’re not watching it.</p>
            <div className="button-row">
              <Link className="button" href={hero.ctaHref}>
                {hero.ctaLabel} <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href={hero.secondaryCtaHref}>{hero.secondaryCtaLabel}</Link>
            </div>
            <div className="trust-strip" aria-label="Ferocity operating assurances">
              <span><ShieldCheck size={15} /> Authorized work stays within your rules</span>
              <span><CheckCircle2 size={15} /> Every action remains traceable</span>
              <span><CircleDollarSign size={15} /> Provider spending stays controlled</span>
            </div>
          </div>

          <div className="product-console" aria-label="Ferocity business awareness example">
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

        <section className="panel activity-story" aria-labelledby="activity-story-title">
          <div className="activity-story-heading">
            <div>
              <p className="eyebrow">Show, don’t explain</p>
              <h2 id="activity-story-title">Imagine what you wouldn’t have to chase anymore.</h2>
            </div>
            <div className="activity-score"><strong>7</strong> situations <span>·</span> <strong>6</strong> handled <span>·</span> <strong>1</strong> decision</div>
          </div>
          <div className="activity-timeline">
            {activityTimeline.map(([time, title, detail], index) => (
              <article className={index === activityTimeline.length - 1 ? "needs-human" : ""} key={`${time}-${title}`}>
                <time>{time}</time>
                <span className="activity-dot" aria-hidden="true" />
                <div><strong>{title}</strong><p>{detail}</p></div>
              </article>
            ))}
          </div>
          <p className="activity-close"><CheckCircle2 size={17} /> Ferocity kept the work moving.</p>
        </section>

        <section className="video-tour">
          <div className="video-frame">
            <FeaturedDemoMedia priority fallbackAlt="Animated Ferocity walkthrough showing work moving across the business" />
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

        <section className="panel business-brain-story">
          <div>
            <p className="eyebrow">Built for the work between the work</p>
            <h2>The bigger the business gets, the more someone has to notice, remember, coordinate, and finish.</h2>
            <p>
              More customers, conversations, employees, jobs, decisions, follow-up, and systems eventually make running the business another job of its own. Ferocity takes on that work.
            </p>
          </div>
          <div className="business-brain-visual" aria-label="One connected Business Brain">
            <div className="brain-core"><BrainCircuit size={22} /><strong>One Business Brain</strong><span>The whole company</span></div>
            <div className="brain-context">
              {['Calls', 'Texts', 'Emails', 'Customers', 'Estimates', 'Jobs', 'Invoices', 'Employees', 'Field updates', 'Rules', 'Promises', 'Decisions'].map((item) => <span key={item}>{item}</span>)}
            </div>
            <p>Sales, operations, collections, marketing, human employees, and AI employees work from the same business context.</p>
            <strong className="brain-signoff">One business. One memory.</strong>
          </div>
        </section>

        <section className="panel capability-story" aria-labelledby="capability-title">
          <div className="capability-heading">
            <div><p className="eyebrow">One operating system</p><h2 id="capability-title">The whole business.</h2></div>
            <p>Not another pile of disconnected tools. One coordinated system for the work customers see—and everything required to deliver it.</p>
          </div>
          <div className="capability-grid">
            {capabilityAreas.map(([title, items]) => (
              <article key={title}><strong>{title}</strong><span>{items}</span></article>
            ))}
          </div>
          <p className="capability-more">And that’s still not everything.</p>
        </section>

        <section className="feature-split differentiation-control">
          <article className="panel">
            <p className="eyebrow">Why Ferocity is different</p>
            <h2>Your business doesn’t need 20 disconnected tools.</h2>
            <p className="muted">
              Businesses keep adding software—and people still have to connect everything. Someone still has to notice what changed, move information around, decide what happens next, and make sure the work gets finished.
            </p>
            <p><strong>Ferocity isn’t 20 tools shoved into one dashboard. It’s the intelligence that makes the whole business work like one.</strong></p>
          </article>
          <article className="panel">
            <p className="eyebrow">You decide how the teams work together</p>
            <div className="control-mode-list">
              {controlModes.map(([title, detail, Icon]) => (
                <div key={title}><Icon size={18} /><span><strong>{title}</strong><small>{detail}</small></span></div>
              ))}
            </div>
            <p className="control-signoff"><ShieldCheck size={17} /> Automation without surrendering control.</p>
            <p className="muted control-detail">Approvals, traceability, communication, publishing, payments, provider spending, and human override stay governed by your rules.</p>
          </article>
        </section>

        <section className="panel operating-loop-story">
          <div>
            <p className="eyebrow">The Ferocity operating loop</p>
            <h2>Unfinished work shouldn’t become invisible.</h2>
            <p>Ferocity keeps asking: <strong>What needs to happen next?</strong></p>
            <p className="muted">The loop continues until the work is complete or something genuinely needs human judgment.</p>
          </div>
          <div className="operating-loop-visual" aria-label="Ferocity operating loop">
            {operatingLoop.map((step, index) => (
              <span key={step}><small>{index + 1}</small>{step}{index < operatingLoop.length - 1 ? <ArrowRight size={14} /> : null}</span>
            ))}
          </div>
          <div className="daily-brief-card">
            <Megaphone size={19} />
            <div><strong>Know what’s happening without watching everything.</strong><p>Daily Briefs surface what changed, what Ferocity advanced, and which decisions genuinely need you.</p></div>
          </div>
        </section>

        <section className="closing-case">
          <p className="eyebrow">Your business doesn’t need another dashboard</p>
          <h2>It needs something watching the dashboard.</h2>
          <div className="closing-comparison" aria-label="How Ferocity differs from traditional software">
            <span>A CRM stores the customer.</span>
            <span>A dashboard shows what happened.</span>
            <span>An automation fires a trigger.</span>
            <span>An AI assistant answers a question.</span>
          </div>
          <p>Ferocity keeps asking what should happen next—and helps make it happen.</p>
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
