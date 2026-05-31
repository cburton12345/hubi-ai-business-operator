import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceJobDetail } from "@/lib/service-ops/get-service-record-detail";
import { createJobProofRequestAction, updateJobAction } from "../../actions";

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

        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Customer Proof</h2>
              <p className="muted">
                After real work is done, prepare a proof link for photos, video, testimonial, rating, and consent. Send manually until live messaging is connected.
              </p>
            </div>
            <Link className="mini-button" href="/app/proof">Open proof engine</Link>
          </div>
          <form action={createJobProofRequestAction} className="compact-form">
            <input name="jobId" type="hidden" value={job.id} />
            <select name="requestType" defaultValue="job_proof">
              <option value="job_proof">Job proof</option>
              <option value="before_after">Before/after</option>
              <option value="testimonial">Testimonial</option>
              <option value="review_proof">Review proof</option>
              <option value="general">General</option>
            </select>
            <button className="mini-button" type="submit">Prepare proof link</button>
          </form>

          <div className="grid section-actions">
            <section className="span-6">
              <h3>Proof Links</h3>
              <ul className="list">
                {job.proofRequests.map((request) => (
                  <li className="list-row" key={request.id}>
                    <div>
                      <h4>{request.requestType}</h4>
                      <p className="muted">{request.createdAt}</p>
                      <Link className="inline-link" href={request.url} target="_blank">{request.url}</Link>
                    </div>
                    <span className="pill">{request.status}</span>
                  </li>
                ))}
                {job.proofRequests.length === 0 ? <li className="list-row"><span className="muted">No proof links prepared for this job yet.</span></li> : null}
              </ul>
            </section>
            <section className="span-6">
              <h3>Proof Submissions</h3>
              <ul className="list">
                {job.proofSubmissions.map((submission) => (
                  <li className="list-row" key={submission.id}>
                    <div>
                      <h4>{submission.title}</h4>
                      <p className="muted">{submission.createdAt} / {submission.assetCount} asset(s)</p>
                    </div>
                    <span className="pill">{submission.status}</span>
                  </li>
                ))}
                {job.proofSubmissions.length === 0 ? <li className="list-row"><span className="muted">No customer proof submitted for this job yet.</span></li> : null}
              </ul>
            </section>
          </div>
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
