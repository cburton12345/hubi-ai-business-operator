import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

const plans = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    fit: "For trying Ferocity with a Business Health Score, real workspace, one lead form, and basic source tracking.",
    included: ["Business Health Score", "1 workspace", "1 brand", "1 user", "1 lead form", "Business profile memory", "Basic CRM"],
    limits: "Good for evaluation and light use. No live SMS/email, payment links, background automations, MarketplacePro sync, or provider publishing.",
    cta: "Start Free"
  },
  {
    key: "ai_growth_report",
    name: "AI Growth Report",
    price: "$49",
    fit: "A one-time growth plan before a subscription, included with Starter and higher.",
    included: ["Complete business audit", "Competitor comparison", "SEO analysis", "Review analysis", "Lead capture analysis", "Automation analysis", "Custom 90-day action plan"],
    limits: "Buy once if you are not ready for a subscription. Included once with Starter and higher. Does not turn on live sends, publishing, payments, ads, or background automations.",
    cta: "Unlock Report"
  },
  {
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    fit: "For businesses that mainly need lead capture, simple pipeline, and basic follow-up.",
    included: ["Everything in Free", "1 included AI Growth Report", "Website import requests", "More leads", "Basic pipeline", "Review/before-after graphic drafts", "Basic reports"],
    limits: "Good for getting organized first. Provider sends still require verified email/SMS accounts and approval.",
    cta: "Start Starter"
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199/mo",
    fit: "For businesses that want SEO, reviews, marketing drafts, customer proof, and attribution.",
    included: ["Everything in Starter", "AI Growth Report refreshes", "Content Studio campaigns", "SEO/service page drafts", "Review request workflows", "Customer proof engine", "GBP/content drafts", "Attribution"],
    limits: "Good for growth work. Live publishing, ad changes, and message sends stay behind approval and connected accounts.",
    cta: "Start Growth"
  },
  {
    key: "operator",
    name: "Operator",
    price: "$399/mo",
    fit: "For businesses that want jobs, estimates, invoices, scheduling, and operations visibility.",
    included: ["Everything in Growth", "Deeper operations plan", "AI video job foundation", "Operator Console", "Jobs and estimates", "Invoices and ledgers", "Proof-to-content workflow", "Scheduling foundation"],
    limits: "Good for teams that need sales, service work, payment visibility, and reporting in the same workspace.",
    cta: "Start Operator"
  },
  {
    key: "pro_agency",
    name: "Pro / Agency",
    price: "Custom",
    fit: "For multi-brand operators, agencies, or advanced service businesses.",
    included: ["Multi-brand AI Growth Reports", "Multi-brand workspaces", "Advanced integrations", "Higher usage", "MarketplacePro connection", "Expanded reporting"],
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
  "Full AI setup runs, Content Studio usage, graphics, and larger content generation",
  "Live email/SMS sends through verified providers",
  "Payment links, invoice reminders, and ledger workflows",
  "Publishing to customer websites, hosted pages, GBP, ads, video providers, or MarketplacePro sync",
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
            <Link href="/business-health-score">Health Score</Link>
            <Link href="/connect-website">Connect Website</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/start">Start</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Plan structure</p>
          <h1>The Operating System for contractors, landlords, and small businesses.</h1>
          <p className="muted">
            CRM, marketing, reviews, AI setup, estimates, payments, operations, and ecosystem access in one hub. Start with the free score. Get the AI Growth Report with Starter and higher, or buy it once before subscribing.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=pricing">
              Start setup
            </Link>
            <Link className="button secondary-button" href="/business-health-score">
              Business Health Score
            </Link>
            <Link className="button secondary-button" href="/demo/tour">
              Take the tour
            </Link>
            <Link className="button secondary-button" href="/automations">
              See automations
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Website hookup
            </Link>
          </div>
        </section>

        <section className="pricing-grid" id="ai-growth-report">
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
              <Link className="button" href={plan.key === "ai_growth_report" ? "/business-health-score" : `/start?source=pricing&plan=${plan.key}`}>
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
              <h2>Ferocity is the hub, not just a CRM</h2>
              <p className="muted">
                MarketplacePro, BidOps, 4Bid, Homes4Rent, and Guardian Signal can appear as ecosystem options when they match a real business need. Ferocity keeps the operating loop in one place.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
        </section>

        <section className="grid section-actions">
          {[
            "MarketplacePro Access",
            "BidOps Opportunities",
            "Homes4Rent Integration",
            "Guardian Signal Integration",
            "4Bid Marketplace Access"
          ].map((item) => (
            <div className="panel span-4 metric" key={item}>
              <span className="muted">Ecosystem</span>
              <strong>{item}</strong>
              <small className="muted">Shown when it fits the business, not forced into every setup.</small>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
