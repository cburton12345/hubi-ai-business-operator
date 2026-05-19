import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Hubi Phase 2</p>
            <h1>AI Business Operator for multi-workspace growth.</h1>
            <p className="muted">
              Workspace isolation, multi-brand operations, lead capture, weekly AI marketing plans, drafts, recommendations, and approvals.
            </p>
          </div>
          <Link className="button" href="/app">
            Open Dashboard
          </Link>
        </div>
        <div className="grid">
          <div className="panel span-4">
            <h2>Workspace First</h2>
            <p className="muted">Every operational record is scoped by organization workspace, then brand.</p>
          </div>
          <div className="panel span-4">
            <h2>Multi-Model</h2>
            <p className="muted">Local service, rental, software, marketplace, and lead-generation businesses.</p>
          </div>
          <div className="panel span-4">
            <h2>Approval Ready</h2>
            <p className="muted">AI drafts and recommendations move through a reviewable workflow.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
