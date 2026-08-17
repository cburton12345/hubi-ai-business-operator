import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { jobTrackerPlan, primaryPublicPlans } from "@/lib/billing/public-plans";
import { getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity Pricing | AI Operating System for Businesses",
  description:
    "Compare Ferocity Calls and complete AI operating-system plans for phone answering, follow-up, jobs, growth, payments, operations, and daily business control.",
  alternates: { canonical: "/pricing" }
};

const customPlans = [
  {
    name: "Pro / Agency",
    fit: "Run more brands, locations, or volume.",
    body: "For multi-business owners, agencies, franchises, advanced integrations, and higher usage.",
    bullets: ["Multi-business command", "Higher limits", "Advanced integrations", "Implementation path"],
    cta: "Talk to Ferocity",
    href: "/start?source=pricing&plan=pro_agency"
  },
  {
    name: "Managed Operator",
    fit: "We help run Ferocity with you.",
    body: "For owners who want Ferocity configured, watched, tuned, and reviewed through a managed operating path.",
    bullets: ["Managed setup", "AI action review", "Growth and follow-up tuning", "Owner escalation path"],
    cta: "Request managed help",
    href: "/start?source=pricing&plan=managed_operator"
  }
];

const connectedServices = [
  ["Online invoice payments", "Connect Stripe", "Customers receive a secure online checkout. Direct charges enter the business Stripe balance, and Stripe pays out to its connected bank account."],
  ["Advertising", "Create + export now", "Create campaigns and platform-specific creative now. Direct ad-platform execution is enabled only for an activated adapter; manual export remains available."],
  ["Video ads", "Briefs now; rendering connected", "Scripts, hooks, scenes, voiceover drafts, and briefs work without a renderer. Premium rendering requires an activated provider and may use credits."],
  ["AI receptionist", "Available with Ferocity Calls", "Retell inbound and approved outbound calling are supported after the workspace, agent, phone route, consent, and billing setup pass verification. Alternate voice engines remain available only through certified adapters."],
  ["Email and SMS", "Supported adapters", "Resend email and Twilio texting can execute after connection. Manual drafts and copy-to-send fallbacks remain available."],
  ["Web publishing", "Prepare + review", "Prepare publish-ready content, use hosted Ferocity pages, or export it. Direct external publishing requires an activated adapter."],
  ["Another provider", "Request an adapter", "Request a reviewed BYO adapter for a niche provider without changing Ferocity’s core business workflows."]
];

const fees = [
  ["Ad spend", "Paid directly to the advertising platform or handled under written managed terms."],
  ["Payment processing", "Stripe or another connected payment provider charges its normal processing fees."],
  ["Heavy provider usage", "Live voice, rendered video, high-volume messaging, storage, and premium AI may use credits or approved overages."],
  ["Managed work", "Custom setup, monitoring, marketing, or payment services require clear written pricing."]
];

const engineLevels = [
  {
    name: "Starter",
    title: "Keep the everyday business under control",
    body: "See what needs attention, prepare follow-up, organize customers and jobs, track money, and turn finished work into reviews and proof."
  },
  {
    name: "Growth",
    title: "Create and convert more demand",
    body: "Add persistent follow-up, customer retention, reviews, content, search visibility, campaigns, and clear source-to-revenue tracking."
  },
  {
    name: "Operator",
    title: "Have the operating day watched for you",
    body: "Add proactive monitoring across jobs, estimates, invoices, scheduling, the team, customer communications, and owner decisions."
  }
];

const capabilityComparison = [
  ["AI role", "Core AI operator", "AI growth department", "AI operating team"],
  ["Office work", "Leads, reminders, review drafts, daily queue", "Customer service, proof, reviews, and marketing follow-up", "Scheduling, job coordination, collections, and voice readiness"],
  ["Authority", "Finished-job proof and review drafts", "Proof-to-content bundles and publishing queue", "Reputation monitoring, reporting, and advanced authority management"],
  ["Marketing", "Recommendations, SEO plan, graphics, and ad/video briefs", "Content Studio, campaigns, SEO/GEO, AI-search visibility, and marketing memory", "Optimization checks, multi-platform launch kits, and provider-ready media work"],
  ["Estimating", "Core takeoffs and reviewed bid drafts", "Supplier comparisons, preferences, and margin review", "Advanced takeoffs, order lists, and actual-versus-estimate learning"],
  ["Connected workflows", "Draft and review first", "SMS, email, reviews, publishing, and revenue attribution", "Payments, calendar, dispatch, voice, video, and deeper integrations"],
  ["Owner control", "Priorities and attention alerts", "Monitoring queues and persisted growth decisions", "Command Center, daily operating brief, escalation, and cross-business decisions"]
];

export default async function PricingPage() {
  const hero = await getPublicCopy("pricing_hero");
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1>{hero.headline}</h1>
          <p className="muted">{hero.body}</p>
          <div className="button-row">
            <Link className="button" href={hero.ctaHref}>
              {hero.ctaLabel} <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href={hero.secondaryCtaHref}>{hero.secondaryCtaLabel}</Link>
          </div>
        </section>

        <section className="panel feature-split" aria-label="Ferocity Earn pricing">
          <div>
            <p className="eyebrow">Pay when the business gets paid</p>
            <strong className="price-line">$0/month base</strong>
            <h2>Ferocity Earn</h2>
            <p className="muted">0.9% when your business brings an opportunity to Ferocity to manage. 6% when Ferocity creates the opportunity. The two rates never stack.</p>
          </div>
          <div>
            <p className="muted">Earn applies to eligible revenue actually collected—not leads, estimates, contracts, completed jobs, or unpaid invoices. Provider usage, payment processing, and third-party costs remain separate.</p>
            <Link className="button" href="/start?source=pricing&plan=earn">Ask about Ferocity Earn</Link>
          </div>
        </section>

        <section className="pricing-grid" id="plans" aria-label="Primary Ferocity plans">
          {primaryPublicPlans.map((plan) => (
            <article className={`panel pricing-card${plan.featured ? " featured-pricing-card" : ""}`} key={plan.key}>
              <div>
                <p className="eyebrow">{plan.featured ? "Most popular · " : ""}{plan.name}</p>
                <strong className="price-line">{plan.price}</strong>
                <h2>{plan.fit}</h2>
              </div>
              <Link className="button plan-primary-cta" href={`/subscribe?plan=${plan.key}`}>
                Start {plan.name}
              </Link>
              <p className="muted">{plan.bestFor}</p>
              <ul className="plain-list">
                {plan.bullets.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <details className="plan-feature-details">
                <summary>See {plan.moreFeatures.length} more included capabilities</summary>
                <ul className="plain-list">
                  {plan.moreFeatures.map((item) => (
                    <li key={item}>
                      <CheckCircle2 size={15} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </section>

        <section className="panel feature-split" aria-label="Ferocity Calls plan guidance">
          <div>
            <p className="eyebrow">Start with the phone department</p>
            <h2>Ferocity Calls works on its own—and it is already part of the larger operating system.</h2>
            <p className="muted">
              Start with AI phone coverage for $49 per month plus $0.25 per completed voice minute. Calls use the same
              contacts, Business Brain, scheduling, communications history, and authority controls as full Ferocity.
            </p>
          </div>
          <div>
            <p className="muted">
              If the business later adds Starter, Growth, or Operator, its call history and setup stay in place. Connected
              CRM and field-service handoffs are optional and only turn on after the selected provider adapter and permissions are ready.
            </p>
            <Link className="button secondary-button" href="/subscribe?plan=calls">Start Ferocity Calls</Link>
          </div>
        </section>

        <section className="section-actions">
          <p className="eyebrow">One engine, three levels</p>
          <h2>Every plan does real work. Higher plans take on a larger job.</h2>
          <p className="muted">
            Higher plans do not unlock the idea of AI running the work. They give the same core engine more
            business context, more specialized workflows, more connected systems, and more permission to operate proactively.
          </p>
          <div className="public-grid">
            {engineLevels.map((level) => (
              <article className="panel value-card" key={level.name}>
                <p className="eyebrow">{level.name}</p>
                <h2>{level.title}</h2>
                <p className="muted">{level.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">What the upgrades actually unlock</p>
          <h2>The upgrade is more responsibility—not arbitrary usage limits.</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Starter</th>
                  <th scope="col">Growth</th>
                  <th scope="col">Operator</th>
                </tr>
              </thead>
              <tbody>
                {capabilityComparison.map(([capability, starter, growth, operator]) => (
                  <tr key={capability}>
                    <th scope="row">{capability}</th>
                    <td>{starter}</td>
                    <td>{growth}</td>
                    <td>{operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel managed-pricing-card">
          <div>
            <p className="eyebrow">Focused paid option</p>
            <strong className="price-line">{jobTrackerPlan.price}</strong>
            <h2>{jobTrackerPlan.fit}</h2>
            <p className="muted">{jobTrackerPlan.bestFor}</p>
            <Link className="button secondary-button" href="/subscribe?plan=job_tracker">Start Job Tracker</Link>
          </div>
          <div>
            <ul className="plain-list">
              {jobTrackerPlan.bullets.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <details className="plan-feature-details">
              <summary>See {jobTrackerPlan.moreFeatures.length} more included capabilities</summary>
              <ul className="plain-list">
                {jobTrackerPlan.moreFeatures.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={15} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>

        <section className="section-actions">
          <p className="eyebrow">Custom options</p>
          <h2>Need more scale—or want us to help run it?</h2>
          <div className="public-grid">
            {customPlans.map((plan) => (
              <article className="panel value-card" key={plan.name}>
                <p className="eyebrow">{plan.name}</p>
                <strong className="price-line">Custom</strong>
                <h2>{plan.fit}</h2>
                <p className="muted">{plan.body}</p>
                <ul className="plain-list">
                  {plan.bullets.map((item) => (
                    <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>
                  ))}
                </ul>
                <Link className="button secondary-button" href={plan.href}>{plan.cta}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Connected and managed services</p>
          <h2>Powerful when you need it. Clear about what must be connected.</h2>
          <div className="value-ladder">
            {connectedServices.map(([name, status, body]) => (
              <div key={name}>
                <strong>{name}</strong>
                <small className="pill">{status}</small>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <h2>What can cost extra?</h2>
            <ul className="plain-list">
              {fees.map(([title, body]) => (
                <li key={title}>
                  <ShieldCheck size={16} />
                  <span><strong>{title}:</strong> {body}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>No surprise automation</h2>
            <p className="muted">
              Messages, calls, publishing, ad changes, payment requests, and managed spending remain off until
              the right account, limits, consent, and approval rules are configured.
            </p>
            <p className="muted">
              BYO and manual-export paths remain available when a native connection is unnecessary or unavailable.
            </p>
          </article>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Ready to start?</p>
            <h2>Pay securely, activate the workspace, and finish setup inside Ferocity.</h2>
            <p>Only email and company name are required before Stripe Checkout.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/subscribe?plan=growth">
              Start Growth <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/business-health-score">Use the free grader</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
