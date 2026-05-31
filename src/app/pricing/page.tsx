import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

const plans = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    fit: "For trying Ferocity with real lead capture and source tracking.",
    included: ["1 workspace", "1 brand", "1 user", "1 lead form", "25 leads/month", "5 proof submissions", "Manual tasks"],
    limits: "No live SMS/email, no payment links, no background automations, no MarketplacePro sync, and only tiny AI/setup previews.",
    cta: "Start Free"
  },
  {
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    fit: "For businesses that mainly need lead capture and basic follow-up.",
    included: ["Everything in Free", "More leads", "Basic pipeline", "25 proof submissions", "Manual follow-up tasks", "Basic reports"],
    limits: "For getting organized first with a focused lead and follow-up workspace. Provider sends still require setup.",
    cta: "Start Starter"
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199/mo",
    fit: "For businesses that want SEO, reviews, marketing drafts, and attribution.",
    included: ["Everything in Starter", "SEO/service page drafts", "Review request workflows", "Customer proof engine", "GBP/content drafts", "Attribution"],
    limits: "For businesses that want marketing output, review flow, source tracking, and follow-up automation scans.",
    cta: "Start Growth"
  },
  {
    key: "operator",
    name: "Operator",
    price: "$399/mo",
    fit: "For businesses that want jobs, estimates, invoices, scheduling, and operations visibility.",
    included: ["Everything in Growth", "Operator Console", "Jobs and estimates", "Invoices and ledgers", "Proof-to-content workflow", "Scheduling foundation"],
    limits: "For teams that need sales, service work, payment visibility, and reporting in the same workspace.",
    cta: "Start Operator"
  },
  {
    key: "pro_agency",
    name: "Pro / Agency",
    price: "Custom",
    fit: "For multi-brand operators, agencies, or advanced service businesses.",
    included: ["Multi-brand workspaces", "Advanced integrations", "Higher usage", "MarketplacePro connection", "Expanded reporting"],
    limits: "For larger teams, multiple brands, and implementation support.",
    cta: "Talk to Ferocity"
  }
];

export default function PricingPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/start">Start</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Plan structure</p>
          <h1>Choose the level that matches how much of the business Ferocity runs.</h1>
          <p className="muted">
            Start with lead capture and follow-up, add marketing and reviews, then expand into jobs, estimates, invoices, reporting,
            and multi-brand operations.
          </p>
          <div className="button-row">
            <Link className="button" href="/demo/tour">
              Take the tour
            </Link>
            <Link className="button secondary-button" href="/automations">
              See automations
            </Link>
            <Link className="button secondary-button" href="/start?source=pricing">
              Request access
            </Link>
          </div>
        </section>

        <section className="pricing-grid">
          {plans.map((plan) => (
            <article className="panel pricing-card" key={plan.name}>
              <div>
                <p className="eyebrow">{plan.name}</p>
                <strong className="price-line">{plan.price}</strong>
                <h2>{plan.fit}</h2>
              </div>
              <ul className="plain-list">
                {plan.included.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">{plan.limits}</p>
              <form action="/api/billing/checkout" method="post">
                <input name="plan" type="hidden" value={plan.key} />
                <input name="source" type="hidden" value="pricing" />
                <button className="button" type="submit">
                  {plan.cta}
                </button>
              </form>
            </article>
          ))}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Clear controls, no surprise actions</h2>
              <p className="muted">
                Ferocity shows what is included in each plan, what needs review, and what requires a connected account before it can
                affect customers, publishing, ads, or billing.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
        </section>
      </section>
    </main>
  );
}
