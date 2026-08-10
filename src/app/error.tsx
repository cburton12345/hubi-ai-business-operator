"use client";

export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="public-shell">
      <section className="public-section">
        <div className="public-card" style={{ maxWidth: 680, margin: "10vh auto" }}>
          <p className="eyebrow">Temporary interruption</p>
          <h1>This page could not finish loading.</h1>
          <p className="lead-copy">
            Please try again. If Ferocity is experiencing a wider interruption, recovery information will remain available on the emergency status page.
          </p>
          <div className="hero-actions">
            <button className="button primary-button" onClick={reset}>Try again</button>
            <a className="button secondary-button" href="/emergency.html">Emergency status</a>
          </div>
        </div>
      </section>
    </main>
  );
}
