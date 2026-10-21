import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BellRing, CheckCircle2, CircleDollarSign, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { BusinessDiagnostic } from "@/components/public/BusinessDiagnostic";
import { PublicCommandStory } from "@/components/public/PublicCommandStory";
import { FeaturedDemoMedia } from "@/components/public/FeaturedDemoMedia";
import { ChatExperience } from "@/app/chat/[publicKey]/ChatExperience";
import { getFerocityPublicSalesProfile } from "@/lib/forms/get-public-form-profile";
import { getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Ferocity | The AI Operating System for Running a Business",
  description: "Ferocity finds operational gaps, builds or improves what is missing, and helps run customers, work, people, money, communications, and growth.",
  alternates: { canonical: "/" }
};

const signals = [
  ["Growth opportunity", "A completed project, new review, and customer question can become the next proof-led campaign.", "Content and video prepared"],
  ["Revenue follow-through", "$28k in viewed estimates is losing momentum.", "Approved follow-up moving"],
  ["Collection in progress", "An overdue invoice still has a professional next step.", "Reminder scheduled"],
  ["Needs your decision", "A warranty request falls outside company policy.", "Facts and options ready"]
];

const operatingLoop = [
  ["Create demand", "Find worthwhile opportunities across local visibility, search, reputation, customer evidence, content, video, organic distribution, and carefully controlled paid media."],
  ["Convert the opportunity", "Answer calls and messages, qualify, follow up, prepare estimates or proposals, schedule the next step, and keep interest from quietly disappearing."],
  ["Deliver the work", "Coordinate projects, jobs, tasks, people, documents, purchasing, changes, customer updates, and proof from one shared context."],
  ["Collect the money", "Keep deposits, invoices, failed payments, and overdue balances moving until paid, disputed, intentionally paused, or escalated."],
  ["Retain and compound", "Request reviews, protect relationships, find repeat and referral opportunities, and turn real customer outcomes into future proof."],
  ["Learn what produces profit", "Connect sources and actions to qualified opportunities, completed work, collected revenue, and margin so the next move gets smarter."]
];

const lifecycle = ["Opportunity", "Conversation", "Estimate", "Work", "Invoice", "Payment", "Review", "Next opportunity"];

export default async function HomePage() {
  const [publicSalesProfile, heroCopy, finalCtaCopy] = await Promise.all([
    getFerocityPublicSalesProfile(),
    getPublicCopy("home_hero"),
    getPublicCopy("home_final_cta"),
  ]);

  return <main className="public-page public-home"><section className="public-shell"><PublicNav />
    <section className="hero-command">
      <div className="hero-copy"><p className="eyebrow">{heroCopy.eyebrow}</p><p className="hero-category">One intelligence improving and operating the company</p><h1>{heroCopy.headline}</h1><p className="hero-deck">{heroCopy.body}</p><div className="button-row"><Link className="button secondary-button" href={heroCopy.ctaHref}>{heroCopy.ctaLabel}</Link><Link className="button secondary-button" href={heroCopy.secondaryCtaHref}>{heroCopy.secondaryCtaLabel}</Link></div></div>
      <div className="hero-ask-panel"><p className="eyebrow">Start with the business, not a feature list</p><h2>What should Ferocity help you fix or move forward?</h2><p>Describe the outcome, bottleneck, or work. Ferocity will diagnose it, ask for the minimum useful context, and show you the practical next step.</p><form className="hero-ask-ferocity" action="/ask-ferocity" method="get"><label htmlFor="home-ferocity-question"><strong>Ask Ferocity about your business</strong><span>You do not need to know which tool or workflow you need.</span></label><div><textarea id="home-ferocity-question" name="bottleneck" rows={4} minLength={8} maxLength={1200} placeholder="Example: We have estimates going cold and too much material sitting unused. What should we do first?" required /><button className="button" type="submit">Start the conversation <ArrowRight size={16} /></button></div></form><p className="hero-bottleneck"><strong>Ferocity can carry authorized work through.</strong> It does not stop at a plan when the work is within your rules.</p><div className="trust-strip" aria-label="Ferocity operating assurances"><span><ShieldCheck size={15} /> You set the authority</span><span><CheckCircle2 size={15} /> Actions stay traceable</span><span><CircleDollarSign size={15} /> Spending stays controlled</span></div></div>
    </section>

    {publicSalesProfile ? (
      <PublicCommandStory>
        <ChatExperience
          brandName={publicSalesProfile.brandName}
          experience="ferocity_sales"
          publicKey={publicSalesProfile.publicKey}
        />
      </PublicCommandStory>
    ) : <BusinessDiagnostic />}

    <section className="owner-console-proof" aria-labelledby="owner-console-proof-title">
      <div className="owner-console-proof-copy"><p className="eyebrow">After Ferocity understands the business</p><h2 id="owner-console-proof-title">The conversation becomes coordinated work—not another answer to remember.</h2><p>Ferocity keeps the signals, approved actions, value at risk, and decisions that actually need you in one operating view.</p></div>
      <div className="product-console" aria-label="Ferocity owner command center example"><div className="console-topbar"><div><span className="eyebrow">Owner command center</span><strong>What changed. What moved. What needs you.</strong></div><span className="live-pill">Demo data</span></div><div className="preview-metrics console-metrics"><div className="preview-metric tone-hot"><span>Signals watched</span><strong>128</strong><small>across the business</small></div><div className="preview-metric tone-money"><span>Work advanced</span><strong>17</strong><small>authorized actions</small></div><div className="preview-metric tone-draft"><span>Value protected</span><strong>$37.8k</strong><small>opportunity + cash</small></div><div className="preview-metric tone-trust"><span>Needs judgment</span><strong>1</strong><small>human decision</small></div></div><div className="demo-alert-list">{signals.map(([title, body, status]) => <div key={title}><BellRing size={16} /><strong>{title}</strong><span>{body}</span><em>{status}</em></div>)}</div></div>
    </section>

    <section className="public-proof-band" aria-label="Ways to verify Ferocity before starting">
      <div><strong>Ask the real system</strong><span>The conversation above uses Ferocity&apos;s public product knowledge—not a prerecorded form.</span></div>
      <div><strong>Inspect the operating loop</strong><span>The guided demo shows the context, authority, handoffs, and evidence at every stage.</span></div>
      <div><strong>See the real economics</strong><span>Plans, Earn rates, allowances, usage charges, and outside costs are stated before signup.</span></div>
    </section>

    <section className="panel illustrative-proof" aria-labelledby="illustrative-proof-title">
      <div className="illustrative-proof-intro">
        <p className="eyebrow">One example of the complete loop</p>
        <h2 id="illustrative-proof-title">Turn real work into the next customer—then follow the money through collection.</h2>
        <p className="muted">Illustrative scenario based on current Ferocity capabilities—not a customer result or a promised outcome.</p>
      </div>
      <div className="illustrative-proof-flow" aria-label="Illustrative before, action, and outcome flow">
        <article><span>Opportunity</span><strong>Finished work creates fresh proof</strong><p>Photos, the customer outcome, a review, and real questions reveal a useful message and the audiences most likely to care.</p></article>
        <ArrowRight aria-hidden="true" size={22} />
        <article><span>Ferocity acts</span><strong>Create, adapt, distribute, and follow through</strong><p>Prepare evidence-led posts, video or ad concepts, channel-ready variants, lead responses, and the next approved sales action.</p></article>
        <ArrowRight aria-hidden="true" size={22} />
        <article><span>Closed loop</span><strong>The result stays connected to revenue</strong><p>The opportunity can continue through the estimate, work, invoice, professional collection, review, and what Ferocity should do better next time.</p></article>
      </div>
    </section>

    <section className="video-tour">
      <div className="video-frame">
        <FeaturedDemoMedia priority fallbackAlt="Ferocity coordinating customer, work, money, and growth across one business" />
      </div>
      <div className="video-copy">
        <p className="eyebrow">See the system at work</p>
        <h2>Watch one signal become coordinated action across the business.</h2>
        <p>See how Ferocity keeps context attached as an opportunity moves through communication, work, money, and the next useful step.</p>
        <Link className="button" href="/demo">See the full walkthrough <ArrowRight size={16} /></Link>
      </div>
    </section>

    <section className="panel connected-context-story"><p className="eyebrow">Shared business context</p><h2>A lead does not disappear into a different tool at every step.</h2><p className="muted">Ferocity keeps the context connected from first interest through delivery, payment, reputation, and the next opportunity.</p><div className="hero-context-flow" aria-label="Connected customer lifecycle">{lifecycle.map((step, index) => <span key={step}>{step}{index < lifecycle.length - 1 ? <ArrowRight size={12} /> : null}</span>)}</div></section>

    <section aria-labelledby="capability-title"><div className="section-actions"><p className="eyebrow">One operating loop—not a bag of tools</p><h2 id="capability-title">Create demand. Win the work. Deliver it. Collect it. Learn from it.</h2><p className="muted">Ferocity can keep the customer, commitments, permissions, economics, and next action connected through the entire result.</p></div><div className="capability-grid">{operatingLoop.map(([title, body]) => <article className="panel" key={title}><strong>{title}</strong><p className="muted">{body}</p></article>)}</div></section>

    <section className="panel feature-split growth-money-story">
      <div>
        <p className="eyebrow">Adaptive growth system</p>
        <h2>Ferocity chooses the next growth move from evidence—not a canned campaign.</h2>
        <p className="muted">It can combine the business goal, audience, geography, capacity, margin, customer language, proof, market opportunities, and previous results to rank what is worth doing next. That may become local and AI-search improvements, review and referral work, useful organic content, video and UGC concepts, channel-ready publishing, direct conversation acquisition, or paid amplification after a message proves itself.</p>
        <p className="muted">The objective is not more content or clicks. It is qualified opportunities, collected revenue, and profitable growth—with public publishing and spending kept inside the owner&apos;s rules.</p>
      </div>
      <div>
        <p className="eyebrow">Persistent, professional collection</p>
        <h2>Stop letting earned revenue quietly go cold.</h2>
        <p className="muted">Ferocity can keep unsold estimates, required deposits, sent invoices, failed payments, and overdue balances on a visible next step. Approved reminders continue on the right channel and cadence while disputes, hardship, unusual risk, or relationship-sensitive decisions go to the right person.</p>
        <p className="muted"><strong>Every dollar remains accounted for</strong> until it is paid, disputed, intentionally paused, written off by an authorized person, or escalated with the history attached.</p>
      </div>
    </section>

    <section className="panel feature-split"><div><p className="eyebrow">Intelligence with authority boundaries</p><h2>Ferocity can prepare it, handle it, or bring it to the right person.</h2></div><div className="stacked-list"><div className="list-row flush-row"><span><strong>Human handles it</strong><br />Assign sensitive or judgment-heavy work to a person.</span></div><div className="list-row flush-row"><span><strong>Ferocity prepares it</strong><br />The work is ready; a person approves the protected action.</span></div><div className="list-row flush-row"><span><strong>Ferocity handles it</strong><br />Authorized routine work moves automatically within your rules.</span></div></div></section>

    <section className="panel feature-split"><div><p className="eyebrow">Fits the systems you already use</p><h2>Connect what matters. Keep what already works.</h2><p className="muted">Ferocity can coordinate through secure connections, imports, and assisted paths without turning provider setup into the product story.</p></div><div><div className="trust-strip"><span>Customer systems</span><span>Email &amp; calendar</span><span>Phones &amp; messaging</span><span>Payments</span><span>Marketing channels</span></div><Link className="button secondary-button" href="/integrations">Check compatibility</Link></div></section>

    <section className="panel homepage-price-preview"><div><p className="eyebrow">Two practical ways to start</p><h2>Plans from $149 a month—or no monthly fee with Earn.</h2><p className="muted">Fixed plans provide predictable operating capability. Earn charges 0.9% on customer-originated collected revenue Ferocity manages, or 6% when Ferocity created the opportunity. The rates never stack.</p></div><div className="button-row"><Link className="button" href="/pricing">Compare plans</Link><Link className="button secondary-button" href="/pricing#earn">See Earn</Link></div></section>

    <section className="final-cta"><div><p className="eyebrow">{finalCtaCopy.eyebrow}</p><h2>{finalCtaCopy.headline}</h2><p className="muted">{finalCtaCopy.body}</p></div><div className="button-row"><Link className="button" href={finalCtaCopy.ctaHref}>{finalCtaCopy.ctaLabel} <ArrowRight size={16} /></Link><Link className="button secondary-button" href={finalCtaCopy.secondaryCtaHref}>{finalCtaCopy.secondaryCtaLabel}</Link></div></section>
    <PublicFooter />
  </section></main>;
}
