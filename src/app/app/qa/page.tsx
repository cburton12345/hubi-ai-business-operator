import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperationalQaRuns } from "@/lib/qa/get-operational-qa";
import { runOperationalQaAction } from "./actions";

export default async function OperationalQaPage() {
  const runs = await getOperationalQaRuns();

  return (
    <QueuePageShell
      eyebrow="Operational QA"
      title="Workspace Launch Checks"
      description="Run a database-backed readiness check for the selected organization before beta launch."
    >
      <form action={runOperationalQaAction} className="section-actions">
        <button className="button" type="submit">Run operational QA</button>
      </form>
      <ul className="review-list">
        {runs.map((run) => (
          <li className="panel" key={run.id}>
            <div className="list-row flush-row">
              <div>
                <h3>{run.summary || "QA run"}</h3>
                <p className="muted">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.createdAt))}</p>
              </div>
              <span className={`pill ${run.status === "failed" ? "high" : ""}`}>{run.status}</span>
            </div>
            <ul className="list">
              {run.checks.map((check) => (
                <li className="list-row" key={check.key}>
                  <div>
                    <strong>{check.label}</strong>
                    <span className="muted">{check.detail}</span>
                  </div>
                  <span className={`pill ${check.passed ? "" : "high"}`}>{check.passed ? "passed" : "failed"}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {runs.length === 0 ? <li className="panel"><p className="muted">No QA runs yet.</p></li> : null}
      </ul>
    </QueuePageShell>
  );
}
