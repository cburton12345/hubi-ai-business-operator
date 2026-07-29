import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getReviewFirstExportQueue } from "@/lib/marketing-os/review-first-export-queue";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { updateDraftReviewAction } from "@/app/app/marketing/actions";
import { approveExportQueueItemAction, runExportQueueItemAction } from "./actions";

export default async function MarketingReviewPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const drafts = await getReviewDraftRows();
  const exportQueue = await getReviewFirstExportQueue(workspaceId);

  return (
    <QueuePageShell
      eyebrow="Admin Review"
      title="AI Generated Item Review"
      description="Review, edit, approve, reject, publish, or archive generated content before it reaches customers or public channels."
    >
      <div className="button-row section-actions">
        <Link className="button" href="/app/marketing-os">
          Have AI Set This Up
        </Link>
        <Link className="button secondary-button" href="/app/exports">
          Create export packages
        </Link>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Ready To Export Or Post</h2>
            <p className="muted">
              This is where Ferocity moves from draft work to action. Manual exports can be marked ready now. Direct posting stays off until the connected account is ready.
            </p>
          </div>
          <span className="pill">{exportQueue.length} item{exportQueue.length === 1 ? "" : "s"}</span>
        </div>
        <ul className="list">
          {exportQueue.map((item) => (
            <li className="list-row" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <p className="muted">
                  {item.brandName ?? "Workspace"} / {item.exportType.replaceAll("_", " ")} / {item.providerKey || "manual"} / {item.targetLabel || "no target"}
                </p>
                {item.blockedReason ? <p className="muted">Blocked: {item.blockedReason}</p> : null}
              </div>
              <div className="inline-actions">
                <span className={`pill ${item.riskLevel}`}>{item.riskLevel}</span>
                <span className="pill">{item.status}</span>
                {["draft", "needs_review", "blocked"].includes(item.status) ? (
                  <form action={approveExportQueueItemAction} className="inline-actions">
                    <input name="itemId" type="hidden" value={item.id} />
                    <button className="mini-button" type="submit">Approve</button>
                  </form>
                ) : null}
                {item.status === "approved" ? (
                  <form action={runExportQueueItemAction} className="inline-actions">
                    <input name="itemId" type="hidden" value={item.id} />
                    <button className="mini-button" type="submit">Run/export</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {exportQueue.length === 0 ? (
            <li className="list-row">
              <span className="muted">No export or posting items yet. Use Marketing OS to build an ad package, video brief, SEO page, email, or post.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <h2 className="section-title">Generated Drafts</h2>
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
