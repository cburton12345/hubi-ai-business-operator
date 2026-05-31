import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/about">About</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </nav>
        <section className="panel">
          <p className="eyebrow">Terms</p>
          <h1>Terms of Use</h1>
          <p className="muted">Last updated: May 26, 2026</p>
          <h2>Use of Ferocity</h2>
          <p>
            Ferocity is an AI-assisted business operations platform for service businesses. Users are responsible for reviewing generated drafts, provider actions, customer communications, advertising changes, and published content before use.
          </p>
          <h2>No automatic provider actions</h2>
          <p>
            Ferocity does not make live provider claims unless an integration is configured and enabled. Workflows may remain draft-only, paused, or review-required based on workspace settings, plan limits, consent rules, and provider readiness.
          </p>
          <h2>Customer communications</h2>
          <p>
            Users are responsible for obtaining required consent for email, SMS, phone, review requests, marketing messages, and other customer-facing communications.
          </p>
          <h2>Marketing and SEO</h2>
          <p>
            Ferocity may help prepare useful content, reporting, and optimization recommendations. Search ranking, ad performance, lead volume, revenue, or business growth are not guaranteed.
          </p>
          <h2>Contact</h2>
          <p>Questions can be sent to ferocityflow@outlook.com.</p>
        </section>
      </section>
    </main>
  );
}
