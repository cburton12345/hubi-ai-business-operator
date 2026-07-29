import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getErrorEventGroups } from "@/lib/observability/get-error-events";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function tone(value: string) {
  if (value === "critical" || value === "error") return "high";
  if (value === "warning") return "medium";
  return "";
}

export default async function AppErrorsPage() {
  const groups = await getErrorEventGroups();

  return (
    <QueuePageShell
      eyebrow="Application Errors"
      title="Recorded App And Form Errors"
      description="These are technical error events recorded by Ferocity. They are separate from owner alerts and operational warnings."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Error groups</h2>
            <p className="muted">Grouped by affected route/action, severity, and message so repeated failures are easy to see.</p>
          </div>
          <span className={`pill ${groups.some((group) => group.status === "open") ? "high" : ""}`}>{groups.length} group(s)</span>
        </div>
        <ul className="list">
          {groups.map((group) => (
            <li className="list-row" key={`${group.source}-${group.severity}-${group.message}`}>
              <div>
                <h3>{group.source}</h3>
                <p>{group.message}</p>
                <p className="muted">First seen {dateLabel(group.firstSeenAt)} / last seen {dateLabel(group.lastSeenAt)}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{group.category.replaceAll("_", " ")}</span>
                <span className={`pill ${tone(group.severity)}`}>{group.severity}</span>
                <span className={`pill ${group.status === "open" ? "high" : ""}`}>{group.status}</span>
                <span className="pill">{group.retryable ? "retryable" : "not retryable"}</span>
                <span className="pill">{group.occurrenceCount} occurrence(s)</span>
              </div>
            </li>
          ))}
          {groups.length === 0 ? (
            <li className="list-row">
              <span className="muted">No app error events have been recorded for this workspace.</span>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}
