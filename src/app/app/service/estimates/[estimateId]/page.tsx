import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceEstimateDetail } from "@/lib/service-ops/get-service-record-detail";
import {
  addPricebookItemToEstimateAction,
  convertEstimateToJobAction,
  deleteEstimateLineItemAction,
  prepareEstimateShareLinkAction,
  saveEstimateLineItemAction,
  updateEstimateAction
} from "../../actions";

const statuses = ["draft", "sent_manually", "approved", "declined", "expired"];

export default async function EstimateDetailPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const estimate = await getServiceEstimateDetail(estimateId);
  if (!estimate) notFound();

  return (
    <QueuePageShell eyebrow="Estimate" title={estimate.title} description={`${estimate.customerName} / ${estimate.total}`}>
      <div className="grid">
        <section className="panel span-7">
          <h2>Line Items</h2>
          {estimate.pricebookItems.length > 0 ? (
            <form action={addPricebookItemToEstimateAction} className="compact-form section-actions">
              <input name="estimateId" type="hidden" value={estimate.id} />
              <select name="pricebookItemId" required defaultValue="">
                <option value="" disabled>Add from pricebook…</option>
                {estimate.pricebookItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.category} — {item.name} ({item.price})</option>
                ))}
              </select>
              <input name="quantity" defaultValue="1" inputMode="decimal" aria-label="Quantity" />
              <label className="inline-checkbox"><input name="optional" type="checkbox" /> Optional</label>
              <button className="mini-button" type="submit">Add priced item</button>
            </form>
          ) : (
            <p className="muted">Build the <Link href="/app/pricebook">pricebook</Link> to add consistent scope and pricing in one click.</p>
          )}
          <ul className="list">
            {estimate.lineItems.map((item) => (
              <li className="list-row" key={item.id}>
                <form action={saveEstimateLineItemAction} className="compact-form">
                  <input name="estimateId" type="hidden" value={estimate.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="name" defaultValue={item.name} />
                  <input name="description" defaultValue={item.description} placeholder="Description" />
                  <input name="quantity" defaultValue={item.quantity} inputMode="decimal" />
                  <input name="unitPrice" defaultValue={item.unitPriceValue} inputMode="decimal" />
                  <button className="mini-button" type="submit">Save</button>
                </form>
                <span className="pill">{item.total}</span>
                <form action={deleteEstimateLineItemAction}>
                  <input name="estimateId" type="hidden" value={estimate.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <button className="mini-button danger-button" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveEstimateLineItemAction} className="compact-form section-actions">
            <input name="estimateId" type="hidden" value={estimate.id} />
            <input name="name" placeholder="New line item" required />
            <input name="description" placeholder="Description" />
            <input name="quantity" defaultValue="1" inputMode="decimal" />
            <input name="unitPrice" placeholder="Unit price" inputMode="decimal" />
            <button className="mini-button" type="submit">Add item</button>
          </form>
          <div className="inline-actions section-actions">
            <Link className="button secondary-button" href={`/app/service/customers/${estimate.customerId}`}>View customer</Link>
            <Link className="button secondary-button" href={`/app/service/estimates/${estimate.id}/preview`}>Preview customer version</Link>
          </div>
        </section>
        <section className="panel span-5 form-stack">
          <h2>Estimate Workflow</h2>
          <div className="notice-card">
            <div>
              <strong>Terms</strong>
              <p className="muted">{estimate.paymentTerms || "No payment terms saved yet."}</p>
              <p className="muted">Deposit: {estimate.depositRequired}</p>
              {estimate.acceptanceNotes ? <p className="muted">{estimate.acceptanceNotes}</p> : null}
            </div>
          </div>
          <div className="notice-card">
            <div>
              <strong>Work plan</strong>
              <p className="muted">
                {estimate.estimatedDurationHours ? `${estimate.estimatedDurationHours} labor hours` : "No labor time saved yet."}
                {estimate.estimatedCrewSize ? ` / ${estimate.estimatedCrewSize} crew` : ""}
              </p>
              {estimate.marketPriceRange ? <p className="muted">Market range: {estimate.marketPriceRange}</p> : null}
              {estimate.marketPriceSource ? <p className="muted">Source: {estimate.marketPriceSource}</p> : null}
            </div>
          </div>
          <form action={updateEstimateAction} className="form-stack">
            <input name="estimateId" type="hidden" value={estimate.id} />
            <label>
              Status
              <select name="status" defaultValue={estimate.status}>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <details className="panel subtle-panel" open>
              <summary>Customer view</summary>
              <div className="form-grid two section-actions">
                <label>
                  Detail level
                  <select name="customerDisplayMode" defaultValue={estimate.customerDisplayMode}>
                    <option value="simple">Simple total</option>
                    <option value="grouped">Grouped scope</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label>
                  Payment terms
                  <input name="paymentTerms" defaultValue={estimate.paymentTerms} placeholder="50% deposit, balance due on completion" />
                </label>
              </div>
              <label>
                Opening note
                <textarea name="customerIntro" rows={3} defaultValue={estimate.customerIntro} />
              </label>
              <label>
                Customer scope
                <textarea name="customerScopeSummary" rows={4} defaultValue={estimate.customerScopeSummary} />
              </label>
              <label>
                Exclusions
                <textarea name="customerExclusions" rows={3} defaultValue={estimate.customerExclusions} />
              </label>
              <label>
                Acceptance notes
                <textarea name="acceptanceNotes" rows={3} defaultValue={estimate.acceptanceNotes} />
              </label>
              <label>
                Next steps
                <textarea name="customerNextSteps" rows={3} defaultValue={estimate.customerNextSteps} />
              </label>
              <div className="toggle-grid section-actions">
                <label><input type="checkbox" name="showLineItemPrices" defaultChecked={estimate.showLineItemPrices} /> Show prices</label>
                <label><input type="checkbox" name="showQuantities" defaultChecked={estimate.showQuantities} /> Show quantities</label>
                <label><input type="checkbox" name="showMaterialDetails" defaultChecked={estimate.showMaterialDetails} /> Show material detail</label>
                <label><input type="checkbox" name="showLaborDetails" defaultChecked={estimate.showLaborDetails} /> Show labor detail</label>
                <label><input type="checkbox" name="showOverheadDetails" defaultChecked={estimate.showOverheadDetails} /> Show overhead detail</label>
                <label><input type="checkbox" name="showProfitDetails" defaultChecked={estimate.showProfitDetails} /> Show profit detail</label>
              </div>
            </details>
            <label>
              Internal notes
              <textarea name="internalNotes" rows={4} defaultValue={estimate.internalNotes} />
            </label>
            {estimate.laborNotes || estimate.marketPriceNotes ? (
              <div className="notice-card">
                <div>
                  <strong>Internal pricing notes</strong>
                  {estimate.laborNotes ? <p className="muted">{estimate.laborNotes}</p> : null}
                  {estimate.marketPriceNotes ? <p className="muted">{estimate.marketPriceNotes}</p> : null}
                </div>
              </div>
            ) : null}
            <label>
              Manual follow-up draft
              <textarea name="followUpDraft" rows={5} defaultValue={estimate.followUpDraft} />
            </label>
            <button className="button" type="submit">Save estimate</button>
          </form>
        </section>
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Customer Share Link</h2>
              <p className="muted">
                Create a secure estimate link for the customer. If email is ready, Ferocity can send it. If not, use the link manually.
              </p>
            </div>
            <span className="pill">{estimate.shareLink?.status ?? "not shared"}</span>
          </div>
          {estimate.shareLink ? (
            <div className="notice-card section-actions">
              <div>
                <strong>Current link</strong>
                <p className="muted">{estimate.shareLink.url}</p>
                {estimate.shareLink.emailTo ? <p className="muted">Email: {estimate.shareLink.emailTo}</p> : null}
                {estimate.shareLink.sentAt ? <p className="muted">Sent: {estimate.shareLink.sentAt}</p> : null}
                <p className="muted">Delivery: {estimate.shareLink.deliveryStatus.replaceAll("_", " ")}</p>
                {estimate.shareLink.deliveryError ? <p className="form-error">{estimate.shareLink.deliveryError}</p> : null}
                {estimate.shareLink.acceptedAt ? <p className="muted">Accepted: {estimate.shareLink.acceptedAt}</p> : null}
              </div>
              <Link className="mini-button" href={estimate.shareLink.url}>Open public estimate</Link>
            </div>
          ) : null}
          <form action={prepareEstimateShareLinkAction} className="compact-form section-actions">
            <input name="estimateId" type="hidden" value={estimate.id} />
            <input name="emailTo" type="email" placeholder="customer@example.com" defaultValue={estimate.shareLink?.emailTo ?? ""} />
            <input name="expiresInDays" inputMode="numeric" defaultValue="30" aria-label="Expires in days" />
            <label className="inline-checkbox"><input type="checkbox" name="sendEmail" /> Send by email if ready</label>
            <button className="mini-button" type="submit">Create customer link</button>
          </form>
        </section>
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Turn This Bid Into Work</h2>
              <p className="muted">
                When the customer says yes, create the job from this estimate so scheduling, field notes, proof, and invoicing stay connected.
              </p>
            </div>
            <span className="pill">{estimate.linkedJobs.length ? "job created" : "ready"}</span>
          </div>
          {estimate.linkedJobs.length ? (
            <ul className="list">
              {estimate.linkedJobs.map((job) => (
                <li className="list-row" key={job.id}>
                  <div>
                    <h4>{job.title}</h4>
                    <p className="muted">{job.status} / {job.schedule}</p>
                  </div>
                  <Link className="mini-button" href={`/app/service/jobs/${job.id}`}>Open job</Link>
                </li>
              ))}
            </ul>
          ) : (
            <form action={convertEstimateToJobAction} className="compact-form">
              <input name="estimateId" type="hidden" value={estimate.id} />
              <input name="scheduledStart" type="datetime-local" aria-label="Scheduled start" />
              <input name="scheduledEnd" type="datetime-local" aria-label="Scheduled end" />
              <input name="serviceArea" placeholder="Service area" defaultValue="" />
              <input name="dispatcherNotes" placeholder="Crew notes or materials to prep" defaultValue={estimate.internalNotes} />
              <button className="mini-button" type="submit">Create job</button>
            </form>
          )}
        </section>
      </div>
    </QueuePageShell>
  );
}
