import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, DollarSign, HardHat, RefreshCw } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getConstructionJobHealthDashboard, type ConstructionJobHealth } from "@/lib/construction/job-health";
import {
  prepareConstructionFieldLogAction,
  refreshConstructionHealthAction,
  reviewConstructionFieldLogAction
} from "./actions";

const statusLabel: Record<ConstructionJobHealth["healthStatus"], string> = {
  on_track: "On track",
  needs_information: "Needs information",
  money_risk: "Money risk",
  schedule_risk: "Schedule risk",
  procurement_risk: "Material risk",
  safety_risk: "Safety review",
  needs_attention: "Needs attention"
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export default async function ConstructionJobHealthPage() {
  const dashboard = await getConstructionJobHealthDashboard();

  return (
    <QueuePageShell
      eyebrow="Construction intelligence"
      title="Job Health"
      description="See which jobs may lose time or money, why Ferocity flagged them, and what needs human review next."
    >
      <section className="panel construction-simple-hero">
        <div>
          <p className="eyebrow">Evidence, not guesses</p>
          <h2>Catch job problems while they are still fixable.</h2>
          <p className="muted">
            Ferocity compares the records you already keep. Every warning shows its source. Missing information
            stays visible, and important decisions remain with your team.
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/job-tracker">Back to simple Work</Link>
          <form action={refreshConstructionHealthAction}>
            <button className="button" type="submit"><RefreshCw size={16} /> Save current snapshot</button>
          </form>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Active jobs" value={dashboard.metrics.activeJobs} icon={<HardHat size={18} />} />
        <Metric label="High-risk jobs" value={dashboard.metrics.highRisk} icon={<AlertTriangle size={18} />} />
        <Metric label="Money risks" value={dashboard.metrics.moneyRisk} icon={<DollarSign size={18} />} />
        <Metric label="Field logs to review" value={dashboard.metrics.fieldLogsToReview} icon={<ClipboardCheck size={18} />} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Natural-language field report</p>
            <h2>Say what happened. Ferocity organizes it.</h2>
            <p className="muted">
              Example: “Electrical finished second-floor rough-in, delivery was two hours late, and room 214 has
              a plumbing conflict.”
            </p>
          </div>
          <span className="pill">Risk-based review</span>
        </div>
        <form action={prepareConstructionFieldLogAction} className="stacked-form construction-quick-form">
          <div className="form-grid two">
            <label>
              Job
              <select name="jobId" required defaultValue="">
                <option value="" disabled>Choose the job</option>
                {dashboard.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title} · {job.customerName}</option>
                ))}
              </select>
            </label>
            <label>
              Report date
              <input name="logDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
          <label>
            What happened?
            <textarea
              name="rawNote"
              rows={5}
              minLength={10}
              maxLength={5000}
              placeholder="Speak or type progress, deliveries, blockers, weather, extra work, safety observations, and what needs follow-up."
              required
            />
          </label>
          <div className="list-row flush-row">
            <p className="muted">
              Routine logs can auto-file when allowed in Controls. Higher-risk logs still ask for review. This
              never sends a message or changes money, scope, schedule, safety, or contract records.
            </p>
            <button className="button" type="submit">Prepare field log</button>
          </div>
        </form>
      </section>

      <section className="section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Current jobs</p>
            <h2>Strongest risk first</h2>
          </div>
          <span className="muted">{dashboard.jobs.length} jobs checked</span>
        </div>
        <div className="feature-split">
          {dashboard.jobs.map((job) => (
            <article className="panel" key={job.id}>
              <div className="list-row flush-row">
                <div>
                  <p className="eyebrow">{job.customerName}</p>
                  <h3><Link href={job.href}>{job.title}</Link></h3>
                </div>
                <span className={`pill severity-${job.severity}`}>{statusLabel[job.healthStatus]}</span>
              </div>

              <div className="grid section-actions">
                <SmallMetric label="Project value" value={money(job.projectValueCents)} />
                <SmallMetric label="Tracked costs" value={money(job.trackedCostCents)} />
                <SmallMetric label="Customer paid" value={money(job.paidCents)} />
                <SmallMetric label="Open purchasing" value={money(job.committedCostCents)} />
              </div>

              {job.risks[0] ? (
                <div className="subtle-panel section-actions">
                  <strong>{job.risks[0].title}</strong>
                  <p>{job.risks[0].explanation}</p>
                  <p className="muted"><strong>Next:</strong> {job.risks[0].recommendation}</p>
                </div>
              ) : (
                <div className="subtle-panel section-actions">
                  <p><CheckCircle2 size={16} /> No current warning was found in the connected records.</p>
                </div>
              )}

              <details className="subtle-panel section-actions">
                <summary>Show all warnings and evidence ({job.risks.length})</summary>
                <div className="stacked-form section-actions">
                  {job.risks.map((risk) => (
                    <section key={risk.key}>
                      <div className="list-row flush-row">
                        <strong>{risk.title}</strong>
                        <span className={`pill severity-${risk.severity}`}>{risk.severity}</span>
                      </div>
                      <p>{risk.explanation}</p>
                      <p className="muted">{risk.recommendation}</p>
                      <ul className="list">
                        {risk.evidence.map((item, index) => (
                          <li className="list-row" key={`${risk.key}-${item.source}-${index}`}>
                            <div>
                              <strong>{item.label}: {item.value}</strong>
                              <p className="muted">{item.detail}</p>
                            </div>
                            <span className="pill">{item.source.replaceAll("_", " ")}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  {job.risks.length === 0 ? <p className="muted">No warnings in the current connected records.</p> : null}
                </div>
              </details>
            </article>
          ))}
          {dashboard.jobs.length === 0 ? (
            <article className="panel">
              <h3>No jobs to check yet</h3>
              <p className="muted">Create or schedule a job, then Ferocity can compare its connected records.</p>
              <Link className="button" href="/app/job-tracker#new-estimate">Create an estimate</Link>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel section-actions">
        <div>
          <p className="eyebrow">Field-log review</p>
          <h2>Only consequential logs should interrupt you.</h2>
          <p className="muted">
            Routine logs can be filed automatically. Safety, money, scope-change, high-severity, or explicitly
            review-controlled logs wait here. Approval still does not send the customer draft or authorize a
            payment, change order, schedule change, safety conclusion, or contractual notice.
          </p>
        </div>
        <ul className="list section-actions">
          {dashboard.recentLogs.map((log) => (
            <li className="list-row" key={log.id}>
              <div>
                <p className="eyebrow">{log.jobTitle} · {new Date(log.date).toLocaleDateString()}</p>
                <strong>{log.summary}</strong>
                <p className="muted">Confidence: {log.confidence} · Status: {log.status.replaceAll("_", " ")}</p>
                {log.riskFlags.length ? (
                  <p>{log.riskFlags.map((flag) => `${flag.title} (${flag.severity})`).join(" · ")}</p>
                ) : null}
                {log.suggestedActions.length ? (
                  <details>
                    <summary>Suggested follow-up</summary>
                    <ul>{log.suggestedActions.map((action) => <li key={action}>{action}</li>)}</ul>
                  </details>
                ) : null}
              </div>
              {log.status === "needs_review" || log.status === "draft" ? (
                <div className="button-row">
                  <ReviewButton id={log.id} decision="approved" label="Approve log" />
                  <ReviewButton id={log.id} decision="rejected" label="Reject" />
                </div>
              ) : <span className="pill">{log.status}</span>}
            </li>
          ))}
          {dashboard.recentLogs.length === 0 ? (
            <li className="list-row"><span className="muted">No field logs yet.</span></li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <section className="panel span-3 metric">
      <div className="metric-label">{icon}<span>{label}</span></div>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="span-3">
      <span className="muted">{label}</span>
      <strong className="block">{value}</strong>
    </div>
  );
}

function ReviewButton({ id, decision, label }: { id: string; decision: "approved" | "rejected"; label: string }) {
  return (
    <form action={reviewConstructionFieldLogAction}>
      <input type="hidden" name="logId" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button className="mini-button" type="submit">{label}</button>
    </form>
  );
}
