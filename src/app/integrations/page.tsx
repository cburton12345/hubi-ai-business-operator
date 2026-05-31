import Link from "next/link";

const marketplaceProUrl = "https://marketplacepro.live";

const providers = [
  { name: "Google Business Profile" },
  { name: "Google Ads" },
  { name: "Google Search Console" },
  { name: "Reddit" },
  { name: "Facebook / Meta" },
  { name: "Microsoft Ads" },
  { name: "Yahoo / Native Ads" },
  { name: "Resend or customer email" },
  { name: "Twilio" },
  { name: "Stripe" },
  { name: "MarketplacePro", href: marketplaceProUrl }
];

export default function PublicIntegrationsPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link className="mini-button" href="/app/integrations">Manage</Link>
          </div>
        </nav>
        <section className="public-hero">
          <p className="eyebrow">Integrations</p>
          <h1>Connect Ferocity to the tools your business already uses.</h1>
          <p className="muted">
            Keep trusted systems for payments, email, phones, calendars, ads, marketplace leads, and public profiles. Ferocity organizes
            the work around them.
          </p>
        </section>
        <section className="panel">
          <h2>Connection Paths</h2>
          <ul className="public-provider-list">
            {providers.map((provider) => (
              <li key={provider.name}>
                {provider.href ? (
                  <Link className="inline-link" href={provider.href}>
                    {provider.name}
                  </Link>
                ) : (
                  provider.name
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>Safe by default</h2>
            <p className="muted">Customer messages, publishing, ad changes, and payment actions require the right connected account and review controls.</p>
          </div>
          <div className="panel">
            <h2>Plain workflow</h2>
            <p className="muted">Connect an account, choose what Ferocity handles, review the work, and keep control over customer-facing actions.</p>
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
              ["Marketplace", "MarketplacePro requests map into the same lead flow."],
              ["Manual sources", "Calls, referrals, and walk-ins can be entered without losing attribution."],
              ["Reporting", "Sources roll up into lead, job, revenue, and review reporting."]
            ].map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
