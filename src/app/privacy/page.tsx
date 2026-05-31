import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/about">About</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </nav>
        <section className="panel">
          <p className="eyebrow">Privacy</p>
          <h1>Privacy Policy</h1>
          <p className="muted">Last updated: May 26, 2026</p>
          <h2>Information Ferocity handles</h2>
          <p>
            Ferocity stores workspace, brand, lead, customer, job, estimate, invoice, message, review, marketing, integration, and activity records that users choose to manage in the platform.
          </p>
          <h2>How the information is used</h2>
          <p>
            Ferocity uses this information to operate CRM workflows, follow-up reminders, marketing planning, attribution, reporting, approvals, provider connection status, and AI-assisted draft generation.
          </p>
          <h2>Provider integrations</h2>
          <p>
            External providers such as email, SMS, calendars, ad platforms, review platforms, Stripe, MarketplacePro, and analytics tools are optional. Ferocity only uses provider credentials or callbacks after they are configured by an authorized workspace user.
          </p>
          <h2>AI and automation</h2>
          <p>
            AI features are intended to prepare summaries, suggested replies, content drafts, next actions, and operational insights. Live sending, publishing, syncing, or spending requires the configured provider, permissions, and approval controls.
          </p>
          <h2>Contact</h2>
          <p>Questions can be sent to ferocityflow@outlook.com.</p>
        </section>
      </section>
    </main>
  );
}
