import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getOperatorAlertRows, type OperatorAlertRow } from "@/lib/alerts/get-operator-alerts";
import { refreshOperatorAlertsAction, resolveOperatorAlertAction } from "./actions";

export default async function OperatorAlertsPage() {
  const rows = await getOperatorAlertRows();
  const activeCount = rows.filter((row) => row.status === "active").length;

  return (
    <QueuePageShell
      eyebrow="Operator Alerts"
      title="Workspace Monitoring"
      description="Review owner-facing alerts that Ferocity generated from scans. Technical app errors live in Application Errors so the counts do not get mixed together."
    >
      <form action={refreshOperatorAlertsAction} className="section-actions">
        <button className="button" type="submit">Refresh alerts</button>
        <span className="pill">{activeCount} active</span>
        <Link className="mini-button" href="/app/errors">Application errors</Link>
      </form>
      <QueueTable<OperatorAlertRow>
        rows={rows}
        columns={[
          {
            key: "alert",
            label: "Alert",
            render: (row) => (
              <div>
                <strong>{row.title}</strong>
                <span className="muted">{row.summary}</span>
              </div>
            )
          },
          { key: "category", label: "Category", render: (row) => row.category },
          { key: "severity", label: "Severity", render: (row) => <span className={`pill ${row.severity === "high" ? "high" : row.severity === "medium" ? "medium" : ""}`}>{row.severity}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "seen", label: "Last Seen", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.lastSeenAt)) },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="button-row">
                <Link className="mini-button" href={row.actionHref}>Review</Link>
                {row.status === "active" ? (
                  <form action={resolveOperatorAlertAction}>
                    <input name="alertId" type="hidden" value={row.id} />
                    <button className="mini-button secondary-button" type="submit">Resolve</button>
                  </form>
                ) : null}
              </div>
            )
          }
        ]}
      />
      {rows.length === 0 ? (
        <p className="muted section-actions">
          No owner alerts yet. Refresh alerts to scan the workspace. If System Health shows app errors, open Application Errors instead.
        </p>
      ) : null}
    </QueuePageShell>
  );
}
