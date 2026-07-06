import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getContentExportRows, type ContentExportRow } from "@/lib/exports/get-content-exports";
import { getWorkspaceDataExportRows, type WorkspaceDataExportRow } from "@/lib/exports/workspace-data-exports";
import { getReviewFirstExportQueueRows, type ReviewFirstExportQueueRow } from "@/lib/exports/get-review-first-export-queue";
import { createExportFromDraftAction, createWorkspaceDataExportAction } from "./actions";
import Link from "next/link";

export default async function ExportsPage() {
  const [drafts, exports, workspaceExports, reviewFirstExports] = await Promise.all([
    getReviewDraftRows(),
    getContentExportRows(),
    getWorkspaceDataExportRows(),
    getReviewFirstExportQueueRows()
  ]);

  return (
    <QueuePageShell
      eyebrow="Data Safety"
      title="Backups & Export Packages"
      description="Create workspace snapshots, review marketing export packages, and keep customer data portable. Google Sheets and Drive sync should connect here later after OAuth is ready."
    >
      <section className="grid cards-grid">
        {[
          {
            title: "Downloadable workspace backup",
            status: "available now",
            body: "Owners and admins can create a JSON snapshot of core workspace data and download it for safekeeping, audits, or offboarding."
          },
          {
            title: "Google Sheets / Drive backup",
            status: "provider planned",
            body: "A good customer-friendly destination once Google OAuth is connected. This should be an extra copy, not the only backup."
          },
          {
            title: "Database recovery",
            status: "platform responsibility",
            body: "Supabase backups, RLS, audit logs, and least-privilege keys remain the real protection against hacks or accidental damage."
          }
        ].map((item) => (
          <article className="panel" key={item.title}>
            <span className="pill">{item.status}</span>
            <h2>{item.title}</h2>
            <p className="muted">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="panel section-actions">
        <div>
          <h2>Workspace Data Backup</h2>
          <p className="muted">
            Create a manual JSON snapshot of brands, services, forms, leads, AI work, approvals, customers, estimates, jobs, invoices, and content packages.
          </p>
        </div>
        <form action={createWorkspaceDataExportAction}>
          <button className="mini-button" type="submit">Create backup package</button>
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
            render: (row) => (
              <div className="button-row">
                <Link className="mini-button" href={`/app/exports/${row.id}`}>View</Link>
                <Link className="mini-button" href={`/api/workspace-data-exports/${row.id}/download`}>Download</Link>
              </div>
            )
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

      <section className="panel section-actions">
        <div>
          <h2>Review-First Export Queue</h2>
          <p className="muted">Marketing, proof, SEO, and growth page outputs land here before anything leaves Ferocity.</p>
        </div>
      </section>

      <QueueTable<ReviewFirstExportQueueRow>
        rows={reviewFirstExports}
        columns={[
          {
            key: "title",
            label: "Review Item",
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <span className="muted">{row.providerKey} / {row.targetLabel}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "type", label: "Type", render: (row) => <span className="pill">{row.exportType}</span> },
          {
            key: "status",
            label: "Status",
            render: (row) => (
              <>
                <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span>
                <span className="pill">{row.status}</span>
              </>
            )
          },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.createdAt)) }
        ]}
      />

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
