import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getContentExportRows, type ContentExportRow } from "@/lib/exports/get-content-exports";
import { getWorkspaceDataExportRows, type WorkspaceDataExportRow } from "@/lib/exports/workspace-data-exports";
import { createExportFromDraftAction, createWorkspaceDataExportAction } from "./actions";
import Link from "next/link";

export default async function ExportsPage() {
  const [drafts, exports, workspaceExports] = await Promise.all([
    getReviewDraftRows(),
    getContentExportRows(),
    getWorkspaceDataExportRows()
  ]);

  return (
    <QueuePageShell
      eyebrow="Manual Publishing"
      title="Content Export Packages"
      description="Prepare copy packages for manual use. External publishing is not connected."
    >
      <section className="panel section-actions">
        <div>
          <h2>Workspace Data Export</h2>
          <p className="muted">Create a manual JSON snapshot for business offboarding, audits, or account portability.</p>
        </div>
        <form action={createWorkspaceDataExportAction}>
          <button className="mini-button" type="submit">Create workspace export</button>
        </form>
      </section>

      <QueueTable<WorkspaceDataExportRow>
        rows={workspaceExports}
        columns={[
          {
            key: "package",
            label: "Workspace Package",
            render: (row) => (
              <>
                <strong>{row.exportScope.replaceAll("_", " ")}</strong>
                <span className="muted">{Object.entries(row.counts).map(([key, count]) => `${key}: ${count}`).join(" / ")}</span>
              </>
            )
          },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "requested", label: "Requested", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.requestedAt)) },
          {
            key: "actions",
            label: "Actions",
            render: (row) => <Link className="mini-button" href={`/app/exports/${row.id}`}>View JSON</Link>
          }
        ]}
      />

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
