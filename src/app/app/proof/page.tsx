import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getProofDashboard } from "@/lib/ugc/proof";
import { createProofRequestAction, prepareProofContentDraftsAction, updateProofAssetAction, updateProofSubmissionAction } from "./actions";

export default async function ProofEnginePage() {
  const dashboard = await getProofDashboard();

  return (
    <QueuePageShell
      eyebrow="Customer Proof"
      title="UGC Proof Engine"
      description="Capture real customer photos, testimonials, before/after links, consent, and draft marketing outputs from completed work."
    >
      <div className="grid section-actions">
        <Metric label="Needs review" value={dashboard.metrics.needsReview} />
        <Metric label="Approved proof" value={dashboard.metrics.approved} />
        <Metric label="Proof assets" value={dashboard.metrics.assets} />
        <Metric label="Draft outputs" value={dashboard.metrics.outputs} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>How It Works</h2>
            <p className="muted">
              After real work is done, send a proof link. The customer can share a story, photo links, video links, rating, and permissions.
              Ferocity keeps everything in review before it becomes marketing.
            </p>
          </div>
          <Link className="mini-button" href="/app/review">Open content review</Link>
        </div>
        <div className="operating-loop">
          {["Completed job", "Customer proof", "Permission check", "Draft marketing"].map((step, index) => (
            <article className="loop-step" key={step}>
              <strong>{index + 1}. {step}</strong>
              <p>
                {index === 0
                  ? "Use real work as the source."
                  : index === 1
                    ? "Collect story, links, rating, and context."
                    : index === 2
                      ? "Confirm what can be public."
                      : "Prepare GBP, Facebook, SEO, testimonial, and ad drafts."}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Create Proof Request</h2>
        <p className="muted">Create a customer-facing link. Send it manually by email, SMS, or your own system until live provider sends are connected.</p>
        <form action={createProofRequestAction} className="compact-form">
          <select name="customerId" required>
            <option value="">Select customer</option>
            {dashboard.candidates.map((candidate) => (
              <option key={`${candidate.customerId}-${candidate.jobId ?? "customer"}`} value={candidate.customerId}>
                {candidate.customerName} / {candidate.jobTitle}
              </option>
            ))}
          </select>
          <select name="jobId">
            <option value="">No specific job</option>
            {dashboard.candidates
              .filter((candidate) => candidate.jobId)
              .map((candidate) => (
                <option key={candidate.jobId ?? candidate.customerId} value={candidate.jobId ?? ""}>
                  {candidate.jobTitle} / {candidate.serviceArea}
                </option>
              ))}
          </select>
          <select name="requestType" defaultValue="job_proof">
            <option value="job_proof">Job proof</option>
            <option value="before_after">Before/after</option>
            <option value="testimonial">Testimonial</option>
            <option value="review_proof">Review proof</option>
            <option value="general">General</option>
          </select>
          <button className="mini-button" type="submit">Create link</button>
        </form>
        <ul className="list">
          {dashboard.requests.map((request) => (
            <li className="list-row" key={request.id}>
              <div>
                <h3>{request.customerName}</h3>
                <p className="muted">
                  {request.requestType} / {request.jobTitle} / {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(request.createdAt))}
                </p>
                <Link className="inline-link" href={`/proof/${request.publicToken}`} target="_blank">
                  /proof/{request.publicToken}
                </Link>
              </div>
              <span className="pill">{request.status}</span>
            </li>
          ))}
          {dashboard.requests.length === 0 ? <li className="list-row"><span className="muted">No proof links have been created yet.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Proof Review Queue</h2>
        <ul className="review-list">
          {dashboard.submissions.map((submission) => (
            <li className="panel" key={submission.id}>
              <div className="list-row flush-row">
                <div>
                  <h3>{submission.title}</h3>
                  <p className="muted">
                    {submission.customerName} / {submission.serviceType} / {submission.location} / {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(submission.createdAt))}
                  </p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${submission.status === "needs_review" ? "medium" : submission.status === "rejected" ? "high" : ""}`}>
                    {submission.status}
                  </span>
                  <span className="pill">{submission.assetCount} asset(s)</span>
                  <span className="pill">{submission.outputCount} output(s)</span>
                </div>
              </div>
              <p>{submission.storyText || submission.resultSummary || "No story text submitted."}</p>
              <div className="inline-actions">
                <span className={`pill ${submission.permissionMarketing ? "" : "high"}`}>
                  {submission.permissionMarketing ? "marketing allowed" : "no marketing consent"}
                </span>
                <span className="pill">{submission.permissionUseName ? "name allowed" : "hide name"}</span>
                <span className="pill">{submission.permissionUseLocation ? "location allowed" : "hide location"}</span>
                {submission.rating ? <span className="pill">{submission.rating}/5 rating</span> : null}
              </div>
              <form action={updateProofSubmissionAction} className="form-stack">
                <input name="submissionId" type="hidden" value={submission.id} />
                <label>
                  Review status
                  <select name="status" defaultValue={submission.status}>
                    <option value="needs_review">needs review</option>
                    <option value="approved">approved</option>
                    <option value="needs_edit">needs edit</option>
                    <option value="rejected">rejected</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
                <label>
                  Internal notes
                  <textarea name="notes" rows={2} placeholder="Consent, claim, photo, or follow-up notes" />
                </label>
                <div className="inline-actions">
                  <button className="mini-button" type="submit">Save review</button>
                  <button className="mini-button" formAction={prepareProofContentDraftsAction} disabled={!submission.permissionMarketing} type="submit">
                    Prepare draft package
                  </button>
                </div>
              </form>
            </li>
          ))}
          {dashboard.submissions.length === 0 ? (
            <li className="panel">
              <h3>No customer proof yet</h3>
              <p className="muted">Create a proof request or use a customer portal proof link after completed work.</p>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Recent Assets</h2>
        <ul className="list">
          {dashboard.assets.map((asset) => (
            <li className="list-row" key={asset.id}>
              <div>
                <h3>{asset.assetType} / {asset.beforeAfter}</h3>
                <p className="muted">
                  {asset.originalFilename || asset.caption || "No filename"} {asset.mimeType ? `/ ${asset.mimeType}` : ""}
                </p>
                <div className="inline-actions">
                  {asset.previewUrl ? (
                    <a className="inline-link" href={asset.previewUrl} rel="noreferrer" target="_blank">
                      Open private preview
                    </a>
                  ) : null}
                  {asset.externalUrl ? (
                    <a className="inline-link" href={asset.externalUrl} rel="noreferrer" target="_blank">
                      Open asset link
                    </a>
                  ) : null}
                  {!asset.previewUrl && !asset.externalUrl ? <span className="muted">Preview unavailable</span> : null}
                </div>
              </div>
              <form action={updateProofAssetAction} className="inline-actions">
                <input name="assetId" type="hidden" value={asset.id} />
                <select name="beforeAfter" defaultValue={asset.beforeAfter}>
                  <option value="before">before</option>
                  <option value="during">during</option>
                  <option value="after">after</option>
                  <option value="result">result</option>
                  <option value="other">other</option>
                </select>
                <select name="status" defaultValue={asset.status}>
                  <option value="needs_review">needs review</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                  <option value="archived">archived</option>
                </select>
                <input name="caption" defaultValue={asset.caption} placeholder="Caption" />
                <button className="mini-button" type="submit">Save asset</button>
              </form>
            </li>
          ))}
          {dashboard.assets.length === 0 ? <li className="list-row"><span className="muted">No proof assets submitted yet.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}
