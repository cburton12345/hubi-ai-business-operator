"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ferocity workspace page failed", error);
  }, [error]);

  return (
    <main className="page-shell">
      <section className="workspace page-section">
        <section className="panel workspace-state-card" role="alert">
          <div>
            <p className="eyebrow">Something interrupted this page</p>
            <h1>This screen did not finish loading</h1>
            <p className="muted">
              Existing records remain stored. Ferocity has not confirmed any new
              change from this interrupted screen, so review the record before
              repeating a save, send, or payment.
            </p>
            {error.digest ? (
              <p className="workspace-error-reference">
                Support reference: {error.digest}
              </p>
            ) : null}
            <div className="button-row section-actions">
              <button className="button" onClick={reset} type="button">
                Try again
              </button>
              <Link className="button secondary-button" href="/app/ferocity">
                Ask Ferocity
              </Link>
              <Link className="mini-button" href="/app/attention-command">
                Go to Today
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
