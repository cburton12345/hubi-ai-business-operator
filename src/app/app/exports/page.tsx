import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getContentExportRows, type ContentExportRow } from "@/lib/exports/get-content-exports";
import { createExportFromDraftAction } from "./actions";

export default async function ExportsPage() {
  const [drafts, exports] = await Promise.all([getReviewDraftRows(), getContentExportRows()]);

  return (
    <QueuePageShell
      eyebrow="Manual Publishing"
      title="Content Export Packages"
      description="Prepare copy packages for manual use. External publishing is not connected."
    >
      <section className="panel section-actions">
        <h2>Create Export From Draft</h2>
        <div className="review-list">
          {drafts.slice(0, 10).map((draft) => (
            <form action={createExportFromDraftAction} className="list-row" key={draft.id}>
              <input name="draftId" type="hidden" value={draft.id} />
              <div>
                <strong>{draft.title}</strong>
                <span className="muted">{draft.brandName} / {draft.contentType}</span>
              </div>
              <button className="mini-button" type="submit">
                Create export
              </button>
            </form>
          ))}
          {drafts.length === 0 ? <p className="muted">No reviewed drafts are available yet.</p> : null}
        </div>
      </section>

      <QueueTable<ContentExportRow>
        rows={exports}
        columns={[
          {
            key: "title",
            label: "Package",
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <span className="muted">{row.body.slice(0, 120)}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "type", label: "Type", render: (row) => <span className="pill">{row.exportType}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.createdAt)) }
        ]}
      />
    </QueuePageShell>
  );
}
