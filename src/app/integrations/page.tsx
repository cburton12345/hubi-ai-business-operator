import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ferocity Integrations",
  description:
    "Connect Ferocity with voice, SMS, video, email, payments, calendars, ads, reviews, marketplace sources, app alerts, and bring-your-own providers.",
  alternates: {
    canonical: "/integrations"
  }
};

const providers = [
  { name: "Google Business Profile" },
  { name: "Google Ads" },
  { name: "Google Search Console" },
  { name: "Reddit" },
  { name: "Facebook / Meta" },
  { name: "Microsoft Ads" },
  { name: "Yahoo / Native Ads" },
  { name: "Resend or customer email" },
  { name: "AI phone receptionist" },
  { name: "Business phone connection and texting" },
  { name: "Customer-requested voice, SMS, or video providers" },
  { name: "Video briefs with connected premium rendering" },
  { name: "App alerts and email by default" },
  { name: "Manual text drafts when needed" },
  { name: "Stripe" },
  { name: "Marketplace and partner sources" },
  { name: "Secure bring-your-own credential vault" }
];

export default function PublicIntegrationsPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>
        <section className="public-hero">
          <p className="eyebrow">Integrations</p>
          <h1>Connect Ferocity to the tools your business already uses.</h1>
          <p className="muted">
            Keep trusted systems for payments, email, SMS, voice, video, calendars, ads, marketplace leads, and public profiles.
            Ferocity organizes the work around them instead of forcing every business into one provider.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=integrations">
              Start setup
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2>Connection paths</h2>
          <ul className="public-provider-list">
            {providers.map((provider) => (
              <li key={provider.name}>{provider.name}</li>
            ))}
          </ul>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>Safe by default</h2>
            <p className="muted">Customer messages, publishing, ad changes, and payment actions require the right connected account and review controls.</p>
          </div>
          <div className="panel">
            <h2>Bring your own provider</h2>
            <p className="muted">Connect a supported account now, or request a secure connection for another service your business already uses.</p>
          </div>
          <div className="panel">
            <h2>Optional modules</h2>
            <p className="muted">A business can start with marketing, automations, operations, or reporting without connecting every outside tool at once.</p>
          </div>
        </section>
        <section className="source-tracking-band">
          <div>
            <p className="eyebrow">Lead source tracking</p>
            <h2>Every connected channel should feed one lead history.</h2>
            <p className="muted">
              Ferocity keeps source, source detail, UTM values, campaign, service, city, and form context with the lead so reporting
              can connect marketing activity to jobs, invoices, and reviews.
            </p>
          </div>
          <div className="source-step-grid">
            {[
              ["Website connector", "Quote buttons, embedded forms, and a small tracking helper attach page and campaign data to leads."],
              ["Forms", "Website and hosted forms capture source, referrer, and UTM data."],
              ["Marketplace", "Marketplace and partner requests map into the same lead flow."],
              ["Manual sources", "Calls, referrals, and walk-ins can be entered without losing attribution."],
              ["Reporting", "Sources roll up into lead, job, revenue, and review reports."]
            ].map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="final-cta">
          <div>
            <p className="eyebrow">Ready path</p>
            <h2>Start with the business workflow. Connect tools when they matter.</h2>
            <p>
              Ferocity can start with lead capture, setup planning, or follow-up before every integration is connected.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/start?source=integrations_bottom">
              Start setup
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Compare plans
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
