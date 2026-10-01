"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Ferocity workspace page failed", error);
  }, [error]);

  return (
    <main className="page-shell">
      <section className="workspace page-section">
        <section className="panel workspace-state-card" role="alert">
          <div>
            <p className="eyebrow">Something interrupted this page</p>
            <h1>Your work is still safe</h1>
            <p className="muted">Try the page again. If it still will not load, Ask Ferocity can help you continue from another screen.</p>
            <div className="button-row section-actions">
              <button className="button" onClick={reset} type="button">Try again</button>
              <Link className="button secondary-button" href="/app/ferocity">Ask Ferocity</Link>
              <Link className="mini-button" href="/app/attention-command">Go to Today</Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
