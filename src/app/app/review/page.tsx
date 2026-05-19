import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { updateDraftReviewAction } from "@/app/app/marketing/actions";

export default async function MarketingReviewPage() {
  const drafts = await getReviewDraftRows();

  return (
    <QueuePageShell
      eyebrow="Admin Review"
      title="AI Generated Item Review"
      description="Review, edit, approve, reject, publish, or archive generated content. External publishing is intentionally not connected."
    >
      <div className="button-row section-actions">
        <Link className="button secondary-button" href="/app/exports">
          Create manual export packages
        </Link>
      </div>
      <ul className="review-list">
        {drafts.map((draft) => (
          <li className="panel" key={draft.id}>
            <form action={updateDraftReviewAction} className="form-stack">
              <input name="draftId" type="hidden" value={draft.id} />
              <div className="list-row flush-row">
                <div>
                  <h3>{draft.brandName}</h3>
                  <p className="muted">
                    {draft.contentType} / {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(draft.createdAt))}
                  </p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${draft.riskLevel}`}>{draft.riskLevel}</span>
                  <span className="pill">{draft.status}</span>
                </div>
              </div>
              <label>
                Title
                <input name="title" defaultValue={draft.title} />
              </label>
              <label>
                Content
                <textarea name="body" defaultValue={draft.body} rows={12} />
              </label>
              <label>
                Status
                <select name="status" defaultValue={draft.status}>
                  <option value="draft">draft</option>
                  <option value="needs_review">needs_review</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" placeholder="Internal review notes" rows={3} />
              </label>
              <button className="button" type="submit">
                Save review
              </button>
            </form>
          </li>
        ))}
        {drafts.length === 0 ? (
          <li className="panel">
            <h3>No generated drafts yet</h3>
            <p className="muted">Run the weekly marketing operator to create draft content for review.</p>
          </li>
        ) : null}
      </ul>
    </QueuePageShell>
  );
}
