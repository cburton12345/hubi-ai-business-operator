import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getWorkspaceDataExportDetail } from "@/lib/exports/workspace-data-exports";

export default async function WorkspaceDataExportDetailPage({ params }: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await params;
  const exportPackage = await getWorkspaceDataExportDetail(exportId);

  if (!exportPackage) {
    notFound();
  }

  return (
    <QueuePageShell
      eyebrow="Workspace Export"
      title="Workspace Backup Package"
      description="Manual JSON snapshot for account portability, business backups, and audits. Review before sharing outside the organization."
    >
      <section className="panel section-actions">
        <div>
          <h2>{exportPackage.exportScope.replaceAll("_", " ")}</h2>
          <p className="muted">
            {exportPackage.status} / created {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(exportPackage.requestedAt))}
          </p>
        </div>
        <div className="button-row">
          <Link className="mini-button" href={`/api/workspace-data-exports/${exportPackage.id}/download`}>Download JSON</Link>
          <Link className="mini-button" href="/app/exports">Back to exports</Link>
        </div>
      </section>

      <section className="panel">
        <h2>Package JSON</h2>
        <pre className="json-block">{JSON.stringify(exportPackage.packageJson, null, 2)}</pre>
      </section>
    </QueuePageShell>
  );
}
