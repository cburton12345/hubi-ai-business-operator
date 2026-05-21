import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceJobDetail } from "@/lib/service-ops/get-service-record-detail";
import { updateJobAction } from "../../actions";

const statuses = ["unscheduled", "scheduled", "in_progress", "completed", "canceled", "lost"];

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getServiceJobDetail(jobId);
  if (!job) notFound();

  return (
    <QueuePageShell eyebrow="Job" title={job.title} description={`${job.customerName} / ${job.schedule}`}>
      <div className="grid">
        <section className="panel span-7">
          <h2>Job Details</h2>
          <dl className="detail-grid">
            <Detail label="Status" value={job.status} />
            <Detail label="Service area" value={job.serviceArea || "Not set"} />
            <div className="detail-wide">
              <dt>Dispatcher notes</dt>
              <dd>{job.dispatcherNotes || "No dispatcher notes."}</dd>
            </div>
            <div className="detail-wide">
              <dt>Completion notes</dt>
              <dd>{job.completionNotes || "No completion notes."}</dd>
            </div>
            <div className="detail-wide">
              <dt>Next action</dt>
              <dd>{job.nextAction || "No next action."}</dd>
            </div>
          </dl>
          <Link className="button secondary-button section-actions" href={`/app/service/customers/${job.customerId}`}>View customer</Link>
        </section>
        <section className="panel span-5 form-stack">
          <h2>Job Workflow</h2>
          <form action={updateJobAction} className="form-stack">
            <input name="jobId" type="hidden" value={job.id} />
            <label>
              Status
              <select name="status" defaultValue={job.status}>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>Scheduled start<input name="scheduledStart" type="datetime-local" /></label>
            <label>Scheduled end<input name="scheduledEnd" type="datetime-local" /></label>
            <label>Dispatcher notes<textarea name="dispatcherNotes" rows={3} defaultValue={job.dispatcherNotes} /></label>
            <label>Completion notes<textarea name="completionNotes" rows={3} defaultValue={job.completionNotes} /></label>
            <label>Next action<textarea name="nextAction" rows={3} defaultValue={job.nextAction} /></label>
            <button className="button" type="submit">Save job</button>
          </form>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
