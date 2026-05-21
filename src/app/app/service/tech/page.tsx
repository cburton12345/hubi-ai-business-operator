import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { updateTechnicianJobAction } from "@/app/app/service/actions";
import { getTechnicianWorkflow } from "@/lib/service-ops/get-technician-workflow";

export default async function TechnicianWorkflowPage() {
  const workflow = await getTechnicianWorkflow();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Technician Workflow"
      description="Mobile-friendly work queue for scheduled and in-progress jobs. Operators still control customer messages, billing, and external dispatch."
    >
      <div className="section-actions button-row">
        <Link className="button secondary-button" href="/app/service">Service command center</Link>
        <Link className="button secondary-button" href="/app/service/routes">Route planning</Link>
      </div>

      <div className="tech-job-list">
        {workflow.jobs.map((job) => (
          <section className="panel tech-job-card" key={job.id}>
            <div className="topbar">
              <div>
                <p className="eyebrow">{job.schedule}</p>
                <h2><Link href={job.href}>{job.title}</Link></h2>
                <p className="muted">{job.customerName} / {job.serviceAddress}</p>
              </div>
              <span className="pill">{job.status}</span>
            </div>
            {job.dispatcherNotes ? <p>{job.dispatcherNotes}</p> : null}
            {job.nextAction ? <p className="muted">{job.nextAction}</p> : null}
            <form action={updateTechnicianJobAction} className="form-stack">
              <input type="hidden" name="jobId" value={job.id} />
              <label>
                Status
                <select name="status" defaultValue={job.status}>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </label>
              <textarea name="dispatcherNotes" rows={2} defaultValue={job.dispatcherNotes} placeholder="Dispatcher notes" />
              <textarea name="completionNotes" rows={3} defaultValue={job.completionNotes} placeholder="Completion notes" />
              <textarea name="nextAction" rows={2} defaultValue={job.nextAction} placeholder="Next action" />
              <button className="button" type="submit">Update job</button>
            </form>
          </section>
        ))}

        {workflow.jobs.length === 0 ? (
          <section className="panel">
            <h2>No active technician jobs</h2>
            <p className="muted">Scheduled and in-progress jobs for today and tomorrow will appear here.</p>
          </section>
        ) : null}
      </div>
    </QueuePageShell>
  );
}
