import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getErrorEventRows, type ErrorEventRow } from "@/lib/observability/get-error-events";

export default async function SafetyPage() {
  const rows = await getErrorEventRows();

  return (
    <QueuePageShell
      eyebrow="Production Safety"
      title="Safety And Error Events"
      description="Operational safety links, recent app errors, and launch runbooks for the selected organization."
    >
      <div className="button-row section-actions">
        <Link className="button secondary-button" href="/app/qa">Operational QA</Link>
        <Link className="button secondary-button" href="/app/beta">Beta checklist</Link>
        <Link className="button secondary-button" href="/app/settings">Organization settings</Link>
      </div>
      <QueueTable<ErrorEventRow>
        rows={rows}
        columns={[
          { key: "source", label: "Source", render: (row) => <><strong>{row.source}</strong><span className="muted">{row.message}</span></> },
          { key: "severity", label: "Severity", render: (row) => <span className={`pill ${row.severity === "critical" || row.severity === "error" ? "high" : ""}`}>{row.severity}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt)) }
        ]}
      />
    </QueuePageShell>
  );
}
