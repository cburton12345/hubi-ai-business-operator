import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link className="mini-button" href="/app">Open app</Link>
          </div>
        </nav>
        <section className="public-hero">
          <p className="eyebrow">About Ferocity</p>
          <h1>Growth, follow-up, and operations for service businesses.</h1>
          <p className="muted">
            Ferocity helps local operators keep marketing, leads, follow-up, estimates, jobs, reviews, and revenue in one practical workspace.
          </p>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>What it does</h2>
            <p className="muted">
              Ferocity tracks lead sources, shows stale opportunities, creates follow-up tasks, drafts marketing work, and keeps customer-facing actions under approval.
            </p>
          </div>
          <div className="panel">
            <h2>Automations</h2>
            <p className="muted">
              Lead replies, callback reminders, stale lead recovery, estimate follow-up, invoice follow-up, review requests, SEO drafts, and operator alerts go through review before customer-facing action.
            </p>
          </div>
          <div className="panel">
            <h2>What it does not do</h2>
            <p className="muted">
              Ferocity does not send messages, publish content, change ads, or start billing without the right connected account, review rules, and customer consent.
            </p>
          </div>
          <div className="panel">
            <h2>Contact</h2>
            <p className="muted">Primary contact: ferocityflow@outlook.com</p>
          </div>
        </section>
      </section>
    </main>
  );
}
