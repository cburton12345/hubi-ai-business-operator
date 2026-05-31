import Link from "next/link";

const marketplaceProUrl = "https://marketplacepro.live";

const steps = [
  { title: "Get found", body: "Storm repair, roof replacement, gutter, and service-area pages move through review." },
  {
    title: "Catch the lead",
    body: (
      <>
        Forms, calls,{" "}
        <Link className="inline-link" href={marketplaceProUrl}>
          MarketplacePro
        </Link>{" "}
        requests, and quote requests become tracked opportunities.
      </>
    )
  },
  { title: "Follow up fast", body: "Missed callbacks, stale leads, estimate follow-ups, and review requests surface in one queue." },
  { title: "Prove ROI", body: "Ferocity connects the page or campaign to leads, booked jobs, invoices, reviews, and revenue." }
];

export default function AcmeRoofingDemoPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/about">About</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </nav>
        <section className="public-hero">
          <p className="eyebrow">Public demo</p>
          <h1>Acme Roofing command center.</h1>
          <p className="muted">
            A public example of how Ferocity organizes growth and operations for a roofing company. This is not the private dashboard.
          </p>
          <div className="button-row">
            <Link className="button" href="/demo">Back to tour</Link>
            <Link className="button secondary-button" href="/integrations">Integrations</Link>
          </div>
        </section>
        <section className="public-grid">
          <div className="panel metric" id="lead-flow">
            <span className="muted">Storm leads</span>
            <strong>24</strong>
          </div>
          <div className="panel metric" id="follow-up">
            <span className="muted">Needs follow-up</span>
            <strong>7</strong>
          </div>
          <div className="panel metric" id="roi">
            <span className="muted">Open estimates</span>
            <strong>$86k</strong>
          </div>
        </section>
        <section className="panel">
          <h2>How Ferocity organizes it</h2>
          <div className="operating-loop">
            {steps.map(({ title, body }) => (
              <div className="loop-step" key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>Marketing</h2>
            <p className="muted">Useful city/service pages, Google Business Profile ideas, review requests, and channel attribution.</p>
          </div>
          <div className="panel">
            <h2>Operations</h2>
            <p className="muted">Lead recovery, callback scheduling, estimate follow-up, invoice nudges, and job visibility.</p>
          </div>
          <div className="panel">
            <h2>Safety</h2>
            <p className="muted">Drafts, approval queues, usage controls, and no customer-facing sends or publishing without review.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
