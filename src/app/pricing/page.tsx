import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { jobTrackerPlan, primaryPublicPlans, publicConnectPlan, publicEarnPlan } from "@/lib/billing/public-plans";
import { getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity Pricing | AI Operating System for Businesses",
  description:
    "Compare complete Ferocity plans for follow-up, jobs, growth, payments, operations, customer communication, and daily business control.",
  alternates: { canonical: "/pricing" }
};

const customPlans = [
  {
    name: "Pro / Agency",
    fit: "Run more brands, locations, or volume.",
    body: "For multi-business owners, agencies, franchises, advanced integrations, and higher usage.",
    bullets: ["Multi-business command", "Higher limits", "Advanced integrations", "Implementation path"],
    cta: "Talk to Ferocity",
    href: "/start?source=pricing&plan=pro_agency#start-request"
  },
  {
    name: "Managed Operator",
    fit: "We help run Ferocity with you.",
    body: "For owners who want Ferocity configured, watched, tuned, and reviewed through a managed operating path.",
    bullets: ["Managed setup", "AI action review", "Growth and follow-up tuning", "Owner escalation path"],
    cta: "Request managed help",
    href: "/start?source=pricing&plan=managed_operator#start-request"
  }
];

const connectedServices = [
  ["Online invoice payments", "Connect Stripe", "Customers receive a secure online checkout. Direct charges enter the business Stripe balance, and Stripe pays out to its connected bank account."],
  ["Advertising", "Create + export now", "Create campaigns and platform-specific creative now. Direct ad-platform execution is enabled only for an activated adapter; manual export remains available."],
  ["Video ads", "Briefs now; rendering connected", "Scripts, hooks, scenes, voiceover drafts, and briefs work without a renderer. Premium rendering requires an activated provider and may use credits."],
  ["AI receptionist", "Available with Ferocity Calls", "Retell inbound and approved outbound calling are supported after the workspace, agent, phone route, consent, and billing setup pass verification. Alternate voice engines remain available only through certified adapters."],
  ["Email and SMS", "Supported adapters", "Resend handles connected email. Ferocity Connect can send approved SMS through a paired Android phone; managed and BYO SMS providers remain separate options."],
  ["Web publishing", "Prepare + review", "Prepare publish-ready content, use hosted Ferocity pages, or export it. Direct external publishing requires an activated adapter."],
  ["Another provider", "Request an adapter", "Request a reviewed BYO adapter for a niche provider without changing Ferocity’s core business workflows."]
];

const fees = [
  ["Ad spend", "Paid directly to the advertising platform or handled under written managed terms."],
  ["Payment processing", "Stripe or another connected payment provider charges its normal processing fees."],
  ["Provider usage", "Core software stays available. Metered services use the stated allowance and a disclosed pay-per-use price where offered; unusually large storage or managed-service needs may require an upgrade."],
  ["Managed work", "Custom setup, monitoring, marketing, or payment services require clear written pricing."]
];

const managedVoiceAllowance: Record<string, string> = {
  calls: "Managed calling is $0.25 per completed minute; no included-minute allowance.",
  starter: "25 managed voice minutes each month; then $0.25 per completed minute.",
  growth: "100 managed voice minutes each month; then $0.25 per completed minute.",
  operator: "300 managed voice minutes each month; then $0.25 per completed minute."
};

const engineLevels = [
  {
    name: "Starter",
    title: "Put the everyday business on one intelligent dashboard",
    body: "Everyday monitoring and authorized routine execution across leads, customers, jobs, schedules, estimates, invoices, payments, and follow-up—with a clear attention list when judgment is needed."
  },
  {
    name: "Growth",
    title: "Create and convert more demand",
    body: "Everything in Starter, plus persistent follow-up, customer retention, reviews, content, search visibility, campaigns, and source-to-revenue tracking."
  },
  {
    name: "Operator",
    title: "Have the operating day watched for you",
    body: "Everything in Growth, plus proactive coordination across jobs, estimates, invoices, scheduling, the team, customer communications, and owner decisions."
  }
];

const capabilityComparison = [
  ["Core workspace", "Dashboard, Ask Ferocity, Business Brain, customer and job records, schedule, estimates, invoices, and payments", "Everything in Starter", "Everything in Growth"],
  ["AI role", "Core AI operator for everyday work", "Everything in Starter, plus an AI growth department", "Everything in Growth, plus a proactive AI operating team"],
  ["Office work", "Lead, reminder, estimate, invoice, review-request, and daily-attention monitoring", "Starter capabilities plus retention, proof, reviews, campaigns, and persistent marketing follow-up", "Growth capabilities plus proactive scheduling, job coordination, collections, team monitoring, and voice readiness"],
  ["Reputation and authority", "Finished-job proof converted into review requests and drafts", "Proof-to-content bundles, service recovery, publishing queues, and search visibility", "Proactive reputation monitoring, reporting, backlink checks, and advanced authority management"],
  ["Marketing", "Recommendations, a 30-day SEO plan, graphics, and ad/video briefs prepared from business data", "Content Studio, campaigns, SEO/GEO, AI-search visibility, and marketing memory", "Optimization checks, multi-platform launch kits, and provider-ready media work"],
  ["Estimating", "Core takeoffs and reviewed bid drafts", "Supplier comparisons, saved preferences, and margin review", "Advanced takeoffs, order lists, and actual-versus-estimate learning"],
  ["Connected execution", "Routine work prepared or executed when the required provider, consent, and authority are in place", "Connected SMS, email, reviews, publishing, and revenue attribution", "Deeper payment, calendar, dispatch, voice, video, and operations connections"],
  ["Owner control", "Dashboard, Ask Ferocity, priorities, attention alerts, and approval controls", "Growth monitoring queues and remembered growth decisions", "Full Command Center, scheduled operating briefs, escalation, and cross-business decisions"]
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

        <section className="panel feature-split" aria-label="Ferocity Earn introduction">
          <div>
            <p className="eyebrow">A lower-commitment way to begin</p>
            <h2>Prefer no monthly subscription?</h2>
          </div>
          <div>
            <p className="muted">Put Ferocity to work and pay a percentage only when eligible revenue is actually collected.</p>
            <Link className="button secondary-button" href="#earn">Explore Ferocity Earn ↓</Link>
          </div>
        </section>

        <section className="section-actions">
          <p className="eyebrow">Complete Ferocity plans</p>
          <h2>The core system stays whole. Ferocity takes on more responsibility as you move up.</h2>
        </section>

        <section className="pricing-grid" id="plans" aria-label="Primary Ferocity plans">
          {primaryPublicPlans.map((plan) => {
            const visibleCapabilities = plan.bullets.slice(0, 5);
            const additionalCapabilities = [...plan.bullets.slice(5), ...plan.moreFeatures];
            return (
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
                  {visibleCapabilities.map((item) => (
                    <li key={item}>
                      <CheckCircle2 size={16} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <details className="plan-feature-details">
                  <summary>See {additionalCapabilities.length} more included capabilities</summary>
                  <ul className="plain-list">
                    {additionalCapabilities.map((item) => (
                      <li key={item}>
                        <CheckCircle2 size={15} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="muted plan-usage-note"><strong>Managed calling included:</strong> {managedVoiceAllowance[plan.key]}</p>
              </article>
            );
          })}
        </section>

        <section className="panel feature-split" id="earn" aria-label="Ferocity Earn pricing">
          <div>
            <p className="eyebrow">{publicEarnPlan.eyebrow}</p>
            <strong className="price-line">{publicEarnPlan.price}</strong>
            <h2>Let Ferocity earn its place in the business.</h2>
            <p className="muted">{publicEarnPlan.fit}</p>
          </div>
          <div>
            <p><strong>{publicEarnPlan.rates}</strong></p>
            <p className="muted">{publicEarnPlan.eligibility} {publicEarnPlan.costs}</p>
            <Link className="button" href="/start?source=pricing&plan=earn#start-request">{publicEarnPlan.cta}</Link>
          </div>
        </section>

        <section className="section-actions">
          <p className="eyebrow">Start with one department</p>
          <h2>Want one immediate win before bringing in the full operating system?</h2>
          <p className="muted">Calls, Android texting, and job tracking are focused entry points—not different products with dead-end data. They use Ferocity records and can grow into the complete operating system without starting over.</p>
        </section>

        <section className="panel feature-split" aria-label="Ferocity Calls plan guidance">
          <div>
            <p className="eyebrow">Start with the phone department</p>
            <h2>Give every caller a capable next step—even when nobody can answer.</h2>
            <p className="muted">
              Ferocity Calls works on its own for $49 per month plus $0.25 per completed voice minute. It uses the same
              contacts, Business Brain, scheduling, communications history, and authority controls as full Ferocity.
            </p>
          </div>
          <div>
            <p className="muted">
              Starter, Growth, and Operator include 25, 100, and 300 managed voice minutes respectively. If the business later adds
              a full plan, its call history and setup stay in place. Connected
              CRM and field-service handoffs are optional and only turn on after the selected provider adapter and permissions are ready.
            </p>
            <Link className="button secondary-button" href="/subscribe?plan=calls">Start Ferocity Calls</Link>
          </div>
        </section>

        <section className="panel feature-split" aria-label="Ferocity Connect pricing">
          <div>
            <p className="eyebrow">Texting without another SMS provider</p>
            <strong className="price-line">{publicConnectPlan.price}</strong>
            <h2>Let Ferocity text from the Android business phone customers already recognize.</h2>
            <p className="muted">{publicConnectPlan.fit}</p>
          </div>
          <div>
            <p className="muted">One device is included with every monthly Ferocity plan. Standalone Connect includes one device; {publicConnectPlan.additionalDevicePrice}. Carrier charges, consent rules, and safety limits still apply.</p>
            <div className="button-row">
              <Link className="button" href="/subscribe?plan=ferocity_connect">Start Connect</Link>
              <Link className="button secondary-button" href="/ferocity-connect">See how it works</Link>
            </div>
          </div>
        </section>

        <section className="panel managed-pricing-card">
          <div>
            <p className="eyebrow">Focused jobs and money</p>
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

        <section className="panel feature-split" aria-label="Included and pay-per-use explanation">
          <div>
            <p className="eyebrow">Built to keep working</p>
            <h2>Included does not mean Ferocity suddenly stops.</h2>
            <p className="muted">
              Each plan includes the everyday operating system and a stated amount of managed provider usage. Managed calling continues after its
              included allowance at the clearly disclosed pay-per-use price instead of disabling the workspace.
            </p>
          </div>
          <div>
            <p className="muted">
              The business can add, change, or remove an optional managed-calling limit. Advertising budgets, payment processing, premium rendered
              media, high-volume messaging, large storage needs, and other third-party costs remain separate so one unusually heavy customer cannot make every plan more expensive.
            </p>
          </div>
        </section>

        <section className="section-actions">
          <p className="eyebrow">One engine, three levels</p>
          <h2>Every full plan includes the dashboard and core operating system. Higher plans take on a larger job.</h2>
          <p className="muted">
            Starter is not a stripped-down dashboard. It includes the core workspace, Business Brain, Ask Ferocity,
            customer and job operations, money tracking, and owner controls. Higher plans give that same system more
            specialized workflows, connected execution, and permission to operate proactively.
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
          <details className="plan-feature-details">
            <summary>Compare every operating level in detail</summary>
            <p className="muted">Nothing disappears as you move up. Each plan adds more work Ferocity can own, and every higher tier includes the capabilities below it.</p>
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
          </details>
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
