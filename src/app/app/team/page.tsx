import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getTalentDashboard } from "@/lib/operations-workforce/get-talent-dashboard";
import { createApplicantAction, createJobOpeningAction, updateApplicantStageAction } from "./actions";

const stages = ["new", "screening", "interview", "reference_check", "offer", "hired", "rejected", "withdrawn"];

export default async function TeamPage() {
  const dashboard = await getTalentDashboard();
  return (
    <QueuePageShell eyebrow="Workforce" title="Hiring, onboarding & readiness" description="Move people from applicant to ready worker without losing interviews, documents, training, or expiring credentials.">
      <div className="metric-grid">
        <Metric label="Open roles" value={dashboard.metrics.openRoles} />
        <Metric label="Active applicants" value={dashboard.metrics.activeApplicants} />
        <Metric label="Upcoming interviews" value={dashboard.metrics.interviews} />
        <Metric label="Onboarding due" value={dashboard.metrics.onboardingDue} />
        <Metric label="Credentials expiring" value={dashboard.metrics.expiringCredentials} />
      </div>
      <div className="button-row section-actions">
        <Link className="button secondary-button" href="/app/operations-workforce">Team operations</Link>
        <Link className="button secondary-button" href="/app/labor-bench">Find labor</Link>
      </div>
      <div className="grid">
        <form action={createJobOpeningAction} className="panel span-6 form-stack">
          <h2>Open a role</h2>
          <input name="title" placeholder="Service technician" required />
          <div className="form-grid two"><input name="department" placeholder="Department" /><input name="location" placeholder="Location" /></div>
          <select name="type" defaultValue="employee"><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option><option value="temporary">Temporary</option><option value="intern">Intern</option></select>
          <textarea name="description" rows={4} placeholder="What success in this role looks like" />
          <button className="button" type="submit">Open role</button>
        </form>
        <form action={createApplicantAction} className="panel span-6 form-stack">
          <h2>Add applicant</h2>
          <select name="openingId" defaultValue=""><option value="">General applicant</option>{dashboard.openings.filter((row) => row.status === "open").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
          <input name="name" placeholder="Applicant name" required />
          <div className="form-grid two"><input name="email" type="email" placeholder="Email" /><input name="phone" placeholder="Phone" /></div>
          <input name="source" placeholder="Referral, careers page, job board" />
          <textarea name="summary" rows={3} placeholder="Verified experience, interests, and constraints" />
          <button className="button" type="submit">Add applicant</button>
        </form>
        <section className="panel span-12">
          <h2>Applicant pipeline</h2>
          <ul className="list">
            {dashboard.applicants.map((applicant) => (
              <li className="list-row" key={applicant.id}>
                <div><h3>{applicant.name} — {applicant.role}</h3><p className="muted">{applicant.source} / updated {applicant.updatedAt}{applicant.score === null ? "" : ` / AI evidence score ${applicant.score}`}</p>{applicant.summary ? <p>{applicant.summary}</p> : null}</div>
                <form action={updateApplicantStageAction} className="compact-form">
                  <input name="applicantId" type="hidden" value={applicant.id} />
                  <select name="stage" defaultValue={applicant.stage}>{stages.map((stage) => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select>
                  <button className="mini-button" type="submit">Move</button>
                </form>
              </li>
            ))}
            {dashboard.applicants.length === 0 ? <li className="list-row"><span className="muted">No applicants yet.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-6">
          <h2>Onboarding due</h2>
          <ul className="list">{dashboard.onboarding.map((task) => <li className="list-row" key={task.id}><div><strong>{task.worker}</strong><p>{task.title}</p><p className="muted">Due {task.due}</p></div><span className="pill">{task.status}</span></li>)}{dashboard.onboarding.length === 0 ? <li className="list-row"><span className="muted">No onboarding tasks due.</span></li> : null}</ul>
        </section>
        <section className="panel span-6">
          <h2>Credential warnings</h2>
          <ul className="list">{dashboard.credentialAlerts.map((item) => <li className="list-row" key={item.id}><div><strong>{item.worker}</strong><p>{item.credential}</p></div><span className="pill high">expires {item.expires}</span></li>)}{dashboard.credentialAlerts.length === 0 ? <li className="list-row"><span className="muted">No verified credentials expire in the next 45 days.</span></li> : null}</ul>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}
