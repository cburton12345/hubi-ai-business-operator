import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

const plans = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    fit: "For trying Ferocity with a real workspace, one lead form, and basic source tracking.",
    included: ["1 workspace", "1 brand", "1 user", "1 lead form", "25 leads/month", "5 proof submissions", "Manual tasks"],
    limits: "Good for evaluation and light use. No live SMS/email, payment links, background automations, MarketplacePro sync, or full AI setup runs.",
    cta: "Start Free"
  },
  {
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    fit: "For businesses that mainly need lead capture, simple pipeline, and basic follow-up.",
    included: ["Everything in Free", "More leads", "Basic pipeline", "25 proof submissions", "Manual follow-up tasks", "Basic reports"],
    limits: "Good for getting organized first. Provider sends still require verified email/SMS accounts and approval.",
    cta: "Start Starter"
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199/mo",
    fit: "For businesses that want SEO, reviews, marketing drafts, customer proof, and attribution.",
    included: ["Everything in Starter", "SEO/service page drafts", "Review request workflows", "Customer proof engine", "GBP/content drafts", "Attribution"],
    limits: "Good for growth work. Live publishing, ad changes, and message sends stay behind approval and connected accounts.",
    cta: "Start Growth"
  },
  {
    key: "operator",
    name: "Operator",
    price: "$399/mo",
    fit: "For businesses that want jobs, estimates, invoices, scheduling, and operations visibility.",
    included: ["Everything in Growth", "Operator Console", "Jobs and estimates", "Invoices and ledgers", "Proof-to-content workflow", "Scheduling foundation"],
    limits: "Good for teams that need sales, service work, payment visibility, and reporting in the same workspace.",
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

const includedByDefault = [
  "Public demo and product tour",
  "Safe setup request form",
  "One workspace per email when automatic creation is selected",
  "Lead source tracking seeds for website, SEO, reviews, calls, ads, referrals, and MarketplacePro",
  "Private dashboard protection for workspace data"
];

const paidOrConnected = [
  "Higher lead, proof, workspace, brand, and user limits",
  "Full AI setup runs and larger content generation",
  "Live email/SMS sends through verified providers",
  "Payment links, invoice reminders, and ledger workflows",
  "Publishing to customer websites, hosted pages, GBP, ads, or MarketplacePro sync",
  "Advanced automations, background scans, reporting, and implementation help"
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
            Free is for evaluation and light capture. Paid tiers unlock higher usage, stronger automations, payments, integrations,
            publishing workflows, and deeper AI setup.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=pricing">
              Start setup
            </Link>
            <Link className="button secondary-button" href="/demo/tour">
              Take the tour
            </Link>
            <Link className="button secondary-button" href="/automations">
              See automations
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
              <Link className="button" href={`/start?source=pricing&plan=${plan.key}`}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </section>

        <section className="feature-split">
          <article className="panel">
            <h2>Included before payment</h2>
            <ul className="plain-list">
              {includedByDefault.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Paid plan or connected account</h2>
            <ul className="plain-list">
              {paidOrConnected.map((item) => (
                <li key={item}>
                  <ShieldCheck size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
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
