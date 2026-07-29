import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getContentExportRows, type ContentExportRow } from "@/lib/exports/get-content-exports";
import { getWorkspaceDataExportRows, type WorkspaceDataExportRow } from "@/lib/exports/workspace-data-exports";
import { getReviewFirstExportQueueRows, type ReviewFirstExportQueueRow } from "@/lib/exports/get-review-first-export-queue";
import { getImportBatches } from "@/lib/imports/get-import-batches";
import { applyCustomerImportAction, createExportFromDraftAction, createWorkspaceDataExportAction, previewCustomerImportAction, rollbackCustomerImportAction } from "./actions";
import Link from "next/link";

export default async function ExportsPage() {
  const [drafts, exports, workspaceExports, reviewFirstExports, importBatches] = await Promise.all([
    getReviewDraftRows(),
    getContentExportRows(),
    getWorkspaceDataExportRows(),
    getReviewFirstExportQueueRows(),
    getImportBatches()
  ]);

  return (
    <QueuePageShell
      eyebrow="Data Safety"
      title="Backups & Export Packages"
      description="Create workspace snapshots, review marketing export packages, and keep customer data portable. Google Sheets and Drive sync connect here after OAuth is ready."
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

      <section className="panel section-actions">
        <h2>Import customers from another system</h2>
        <p className="muted">Paste exported CSV from ServiceTitan, Jobber, Housecall Pro, HighLevel, or a spreadsheet. Ferocity validates first; nothing is imported until you approve the dry run.</p>
        <form action={previewCustomerImportAction} className="form-stack">
          <label>Source system<input name="sourceSystem" placeholder="Jobber" required /></label>
          <label>Customer CSV<textarea name="csv" rows={8} placeholder={"name,email,phone,address,city,state,zip\nJane Customer,jane@example.com,555-0100,12 Main St,Austin,TX,78701"} required /></label>
          <button className="button" type="submit">Validate dry run</button>
        </form>
        <ul className="list section-actions">
          {importBatches.map((batch) => (
            <li className="list-row" key={batch.id}>
              <div>
                <strong>{batch.source} / {batch.entityType}</strong>
                <p className="muted">{batch.total} rows / {batch.valid} valid / {batch.invalid} invalid / {batch.applied} applied / {batch.createdAt}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{batch.status.replaceAll("_", " ")}</span>
                {batch.status === "ready" ? (
                  <form action={applyCustomerImportAction}><input name="batchId" type="hidden" value={batch.id} /><button className="mini-button" type="submit">Apply import</button></form>
                ) : null}
                {["completed", "partial"].includes(batch.status) && batch.applied > 0 ? (
                  <form action={rollbackCustomerImportAction}><input name="batchId" type="hidden" value={batch.id} /><button className="mini-button danger-button" type="submit">Rollback unused records</button></form>
                ) : null}
              </div>
            </li>
          ))}
          {importBatches.length === 0 ? <li className="list-row"><span className="muted">No import batches yet.</span></li> : null}
        </ul>
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
