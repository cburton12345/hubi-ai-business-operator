import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Ferocity Pricing: AI Workforce for Modern Businesses",
  description:
    "Compare Ferocity plans for AI lead response, follow-up, marketing, operations, payments, reviews, owner alerts, and approved repeat work.",
  alternates: {
    canonical: "/pricing"
  }
};

const plans = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    fit: "For seeing where money is leaking before paying.",
    included: [
      "Business Grader",
      "Business Health Score",
      "1 workspace",
      "1 brand",
      "1 user",
      "1 tracked lead form",
      "Business profile memory",
      "Basic CRM",
      "Starter source tracking"
    ],
    limits: "Shows the gaps and starts the first command center. Payment links, heavier automation, website publishing, marketplace connections, and larger AI usage unlock on paid plans or connected accounts.",
    cta: "Start Free"
  },
  {
    key: "autopilot_blueprint",
    name: "Business Autopilot Blueprint",
    price: "$49",
    fit: "For owners who want the autopilot plan before subscribing.",
    included: [
      "Full business audit",
      "Lost revenue opportunities",
      "Top automation recommendations",
      "Lead follow-up plan",
      "SEO and review plan",
      "What Ferocity should run first",
      "30/60/90 day action plan",
      "Credited toward first paid month"
    ],
    limits: "Included with every paid plan. Standalone buyers can apply the $49 toward their first month if they upgrade within 30 days. It gives the owner a real setup path: what Ferocity should build, track, and run first.",
    cta: "Get Blueprint"
  },
  {
    key: "job_tracker",
    name: "Job Tracker",
    price: "$39/mo",
    fit: "For owners who need bids, jobs, materials, people paid, and job profit without the full growth engine.",
    included: [
      "Everything in Free",
      "Simple Mode job tracker",
      "Bids with line items",
      "Payment terms and deposit notes",
      "Material lists",
      "People/subcontractor payments",
      "Basic worker request and availability intake",
      "Basic invoices and payment notes",
      "Job money board",
      "Receipt and reimbursement tracking",
      "Daily job reminders"
    ],
    limits:
      "A real working tier for owners who need clean job and money visibility. Advanced AI marketing, automated publishing, advanced integrations, and background operator automations unlock higher up.",
    cta: "Start Job Tracker"
  },
  {
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    fit: "For a business that wants AI watching leads, follow-up, reviews, jobs, and owner alerts.",
    included: [
      "Everything in Job Tracker",
      "Business Autopilot Blueprint included",
      "Lead form and source tracking",
      "Lead and estimate follow-up queue",
      "Owner attention dashboard",
      "Basic AI follow-up drafts",
      "Review request drafts",
      "Before/after proof drafts",
      "Basic labor match suggestions",
      "Basic pipeline and reports",
      "App alerts for owner attention",
      "Email-ready setup notifications"
    ],
    limits: "Starter is a working business system, not a thin audit. It organizes leads, jobs, follow-up, reviews, proof, owner alerts, and basic AI drafts. Growth unlocks heavier marketing, search planning, publishing plans, attribution, and larger AI usage.",
    cta: "Start Starter"
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199/mo",
    fit: "For businesses that want Ferocity creating demand and proving what turns into revenue.",
    included: [
      "Everything in Starter",
      "Weekly growth briefs",
      "Content Studio campaigns",
      "Search traffic engine",
      "30-day content strategy",
      "Website and marketing platform planning",
      "Review request workflows",
      "Customer proof engine",
      "GBP/content drafts",
      "Attribution"
    ],
    limits: "Best when the business wants more demand, stronger proof, and clearer source-to-revenue tracking. Live publishing, ad changes, and message sends wait until accounts are connected and the business is ready.",
    cta: "Start Growth"
  },
  {
    key: "operator",
    name: "Operator",
    price: "$399/mo",
    fit: "For businesses that want Ferocity helping run the operating day, not just marketing.",
    included: [
      "Everything in Growth",
      "Owner Command Center",
      "AI monitoring and briefing",
      "AI receptionist / sales assistant workflows",
      "AI office manager workflows",
      "Operator Console",
      "Jobs and estimates",
      "Invoices and ledgers",
      "Proof-to-content workflow",
      "Scheduling foundation",
      "Higher Labor Bench limits"
    ],
    limits: "Best when the owner wants one place for sales, work, payments, team visibility, alerts, AI-recommended next actions, and fewer things slipping through the cracks.",
    cta: "Start Operator"
  },
  {
    key: "pro_agency",
    name: "Pro / Agency",
    price: "Custom",
    fit: "For owners with several businesses, agencies, franchises, multi-brand operators, or advanced teams.",
    included: [
      "Everything in Operator",
      "Multi-brand blueprints",
      "Multi-brand workspaces",
      "Advanced integrations",
      "Higher AI and automation usage",
      "Marketplace connections",
      "Expanded reporting",
      "Multi-location operating views",
      "Implementation support path"
    ],
    limits: "For serious operators who need more brands, more usage, more integrations, and more implementation help without turning Ferocity into a confusing mega-app.",
    cta: "Talk to Ferocity"
  }
];

const includedByDefault = [
  "Public demo and product tour",
  "Safe setup request form",
  "One workspace per email when automatic creation is selected",
  "Lead source tracking seeds for website, SEO, reviews, calls, ads, referrals, and marketplace sources",
  "Private dashboard protection for workspace data"
];

const paidOrConnected = [
  "Higher lead, proof, workspace, brand, and user limits",
  "Business Autopilot Blueprint included with paid plans",
  "Full AI setup runs, Content Studio usage, search planning, graphics, and larger content generation",
  "Verified email and app/push alerts for owner attention, reports, setup messages, and customer follow-up",
  "Invoice reminders, ledger workflows, manual payment records, and payment links when payments are connected",
  "Higher worker intake, labor matching, and placement-support limits",
  "Publishing to customer websites, hosted pages, Google profile, ads, video tools, or marketplace connections",
  "Advanced automations, background scans, reporting, and implementation help",
  "More autopilot permissions only when the business turns them on"
];

const paymentModes = [
  {
    name: "Manual tracking",
    fee: "No processing fee",
    detail: "Record cash, check, Zelle, outside Stripe, or other payments so invoices, ledgers, and reports stay accurate."
  },
  {
    name: "Connect your Stripe",
    fee: "Stripe fees only",
    detail: "Use the business owner's Stripe account for online payment links. Ferocity tracks requests, payments, reminders, and ledger entries."
  },
  {
    name: "Ferocity Managed Payments",
    fee: "Not live yet",
    detail: "A future Stripe Connect option for owners who want payment setup help. Fees, refunds, disputes, payouts, and instant payouts must be shown clearly before this is enabled."
  }
];

const choiceGuide = [
  {
    name: "Free",
    answer: "Use this when they want to see the leaks before paying.",
    detail: "Runs the grader, starts the workspace, captures a lead form, and shows the first command-center path."
  },
  {
    name: "Business Autopilot Blueprint",
    answer: "Use this when they want a serious autopilot diagnosis first.",
    detail: "Shows what is leaking money, what Ferocity can fix, which automations should run first, and how the first 30/60/90 days should be set up."
  },
  {
    name: "Job Tracker",
    answer: "Use this when they mainly need jobs and job money under control.",
    detail: "Good for operators who are not ready for AI marketing yet but need one clean place for bids, project costs, people paid, receipts, reimbursements, and material lists."
  },
  {
    name: "Starter",
    answer: "Use this when they want AI doing meaningful daily work.",
    detail: "Good for lead capture, source tracking, follow-up queue, owner alerts, reviews, proof drafts, simple jobs, basic reports, and AI-prepared replies."
  },
  {
    name: "Growth",
    answer: "Use this when they want more demand and better proof.",
    detail: "Adds AI-search checks, SEO plans, reviews, proof capture, content campaigns, Google profile work, website and marketing platform planning, and attribution."
  },
  {
    name: "Operator",
    answer: "Use this when the owner wants Ferocity to help run the business day.",
    detail: "Adds jobs, estimates, invoices, scheduling, workforce visibility, daily work lists, owner alerts, and revenue tracking."
  },
  {
    name: "Pro / Agency",
    answer: "Use this when one owner or team has multiple businesses, brands, locations, or higher usage.",
    detail: "Adds multi-brand workspaces, advanced integrations, higher AI and automation limits, marketplace connections, expanded reporting, and implementation support."
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
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/start">Start</Link>
            <Link href="/connect-website">Connect Website</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/install">Install App</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Plan structure</p>
          <h1>Start free. Upgrade when you want Ferocity taking work off your plate.</h1>
          <p className="muted">
            Start with the free grader. Use Job Tracker for bids, materials, and job money. Use Starter when you want AI watching leads,
            follow-up, reviews, and owner alerts. Growth adds demand and proof. Operator helps run the day. Pro supports multiple businesses,
            brands, locations, and higher usage.
          </p>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader
            </Link>
            <Link className="button secondary-button" href="/start?source=pricing">
              Get my setup plan
            </Link>
            <Link className="button secondary-button" href="/demo/tour">
              Take the tour
            </Link>
            <Link className="button secondary-button" href="/automations">
              See automations
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Which one should I choose?</p>
          <h2>Choose the outcome you want first. Starter is a real working system.</h2>
          <p className="muted">
            Free shows the gaps. Job Tracker keeps jobs and job money organized. Starter adds AI watching leads, follow-up,
            reviews, proof, and owner alerts. Growth adds demand creation. Operator helps run the business day.
          </p>
          <div className="grid section-actions">
            {choiceGuide.map((item) => (
              <article className="panel span-4" key={item.name}>
                <h3>{item.name}</h3>
                <strong>{item.answer}</strong>
                <p className="muted">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-grid" id="business-autopilot-blueprint">
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
              <Link className="button" href={plan.key === "autopilot_blueprint" ? "/business-health-score" : `/start?source=pricing&plan=${plan.key}`}>
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

        <section className="panel section-actions">
          <p className="eyebrow">Autopilot levels</p>
          <h2>The plan controls how much Ferocity can run.</h2>
          <p className="muted">
            Every business can start with recommendations and manual approval. Higher tiers unlock more AI work, more usage,
            more reporting, and more connected-account actions. The owner still chooses what stays manual.
          </p>
          <div className="button-row">
            <Link className="button" href="/business-health-score">Start with free grader</Link>
            <Link className="button secondary-button" href="/start?source=pricing_autopilot&plan=starter">Start Starter</Link>
            <Link className="button secondary-button" href="/demo">See the loop</Link>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Payment options</p>
          <h2>Ferocity should help collect money without hiding fees.</h2>
          <p className="muted">
            Businesses can track manual payments now and connect their own Stripe account for online payment links.
            Managed payments are a future option and must show fees, refunds, disputes, bank returns, and instant-payout costs clearly before use.
          </p>
          <div className="grid section-actions">
            {paymentModes.map((mode) => (
              <article className="panel span-4" key={mode.name}>
                <span className="pill">{mode.fee}</span>
                <h3>{mode.name}</h3>
                <p className="muted">{mode.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Ferocity is the AI operating system, not just a CRM.</h2>
              <p className="muted">
                Marketplace, bid, rental, safety, and partner-system connections can appear when they match a real business need. Ferocity keeps the operating loop in one place.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
        </section>

        <section className="grid section-actions">
          {[
            "Marketplace lead access",
            "Bid opportunity monitoring",
            "Rental workflow connection",
            "Safety alert connection",
            "Partner marketplace access"
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
