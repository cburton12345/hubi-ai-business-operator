import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getReviewDraftRows } from "@/lib/marketing/get-phase2-dashboard";
import { getReviewFirstExportQueue } from "@/lib/marketing-os/review-first-export-queue";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { updateDraftReviewAction } from "@/app/app/marketing/actions";
import { getReviewDestinationAdminData, reviewRequestPublicUrl } from "@/lib/reviews/review-destinations";
import {
  approveExportQueueItemAction,
  archiveReviewDestinationAction,
  runExportQueueItemAction,
  saveReviewDestinationAction
} from "./actions";

const providerLabels = {
  google_business_profile: "Google Business Profile",
  facebook: "Facebook",
  yelp: "Yelp",
  bbb: "Better Business Bureau",
  industry_directory: "Industry directory",
  custom: "Other review site"
};

export default async function MarketingReviewPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const drafts = await getReviewDraftRows();
  const exportQueue = await getReviewFirstExportQueue(workspaceId);
  const reviewData = await getReviewDestinationAdminData(workspaceId);

  return (
    <QueuePageShell
      eyebrow="Reviews & Reputation"
      title="Get more honest customer reviews"
      description="Send one simple feedback link after a job. Customers can choose any review site you support, while private feedback helps your team recover service issues quickly."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Where customers can review you</h2>
            <p className="muted">
              Add the exact Google “Get more reviews” link for the fastest experience. If the business is not on Google, use Facebook, Yelp, BBB, an industry directory, or another review page. Every customer sees the same choices.
            </p>
          </div>
          <span className="pill">{reviewData.destinations.length} connected</span>
        </div>

        <form action={saveReviewDestinationAction} className="form-stack">
          <div className="form-grid">
            <label>
              Applies to
              <select name="brandId" defaultValue="">
                <option value="">Every brand in this workspace</option>
                {reviewData.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>
              Review site
              <select name="provider" defaultValue="google_business_profile">
                {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Button label
              <input name="displayName" defaultValue="Review us on Google" maxLength={100} required />
            </label>
            <label>
              Direct review link
              <input name="reviewUrl" type="url" placeholder="https://g.page/r/.../review" maxLength={2000} required />
            </label>
            <label>
              Display order
              <input name="priority" type="number" min={1} max={999} defaultValue={100} />
            </label>
          </div>
          <div className="inline-actions">
            <button className="button" type="submit">Save review destination</button>
            <a className="button secondary-button" href="https://support.google.com/business/answer/16816815" target="_blank" rel="noreferrer">Find your Google review link</a>
          </div>
        </form>

        <ul className="list">
          {reviewData.destinations.map((destination) => (
            <li className="list-row" key={destination.id}>
              <div>
                <h3>{destination.displayName}</h3>
                <p className="muted">
                  {providerLabels[destination.provider]} / {destination.brandName ?? "Every brand"} / order {destination.priority}
                </p>
              </div>
              <div className="inline-actions">
                <a className="mini-button" href={destination.reviewUrl} target="_blank" rel="noreferrer">Test link</a>
                <form action={archiveReviewDestinationAction}>
                  <input name="destinationId" type="hidden" value={destination.id} />
                  <button className="mini-button" type="submit">Remove</button>
                </form>
              </div>
            </li>
          ))}
          {reviewData.destinations.length === 0 ? (
            <li className="list-row">
              <span className="muted">No public review site is connected yet. Private customer feedback will still work until you add one.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Recent review requests</h2>
            <p className="muted">Each request uses one stable Ferocity link, so destinations can be updated later without rewriting old messages.</p>
          </div>
          <span className="pill">{reviewData.recentRequests.length} recent</span>
        </div>
        <ul className="list">
          {reviewData.recentRequests.map((request) => (
            <li className="list-row" key={request.id}>
              <div>
                <h3>{request.customerName}</h3>
                <p className="muted">
                  {request.brandName ?? "Workspace"} / {request.channel} / {request.status}
                  {request.scheduledFor ? ` / ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(request.scheduledFor))}` : ""}
                </p>
              </div>
              <a className="mini-button" href={reviewRequestPublicUrl(request.publicToken)} target="_blank" rel="noreferrer">Preview</a>
            </li>
          ))}
          {reviewData.recentRequests.length === 0 ? <li className="list-row"><span className="muted">No review requests have been prepared yet.</span></li> : null}
        </ul>
      </section>

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

      <h2 className="section-title">Marketing content awaiting review</h2>
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
