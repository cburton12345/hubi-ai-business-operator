export default function WorkspaceLoading() {
  return (
    <main className="page-shell" aria-busy="true" aria-live="polite">
      <section className="workspace page-section">
        <section className="panel workspace-state-card">
          <span className="workspace-state-spinner" aria-hidden="true" />
          <div>
            <p className="eyebrow">Ferocity</p>
            <h1>Getting your workspace ready</h1>
            <p className="muted">Loading the latest customers, work, messages, and priorities.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
