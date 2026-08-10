import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "System Status",
  description: "Ferocity service status and recovery information.",
  robots: { index: false, follow: false }
};

export default function StatusPage() {
  return (
    <main className="public-shell">
      <section className="public-section">
        <div className="public-card" style={{ maxWidth: 760, margin: "6vh auto" }}>
          <p className="eyebrow">Ferocity system status</p>
          <h1>Service and recovery information</h1>
          <p className="lead-copy">
            When Ferocity experiences an interruption, this page and the static emergency page provide the safest available recovery information. Customer records are never intentionally deleted as part of service recovery.
          </p>
          <div className="hero-actions">
            <a className="button primary-button" href="/health">Check live service health</a>
            <a className="button secondary-button" href="/emergency.html">Open emergency status</a>
            <a className="button secondary-button" href="/login">Return to sign in</a>
          </div>
          <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid var(--line)" }} />
          <h2>What to do during an interruption</h2>
          <ul className="feature-list">
            <li>Wait a moment and retry the action once.</li>
            <li>Do not repeatedly submit payments, messages, or provider actions.</li>
            <li>Use the emergency page for the latest available recovery direction.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
