import { notFound } from "next/navigation";
import { getPublicEstimate } from "@/lib/service-ops/get-public-estimate";
import { acceptEstimateAction, updateEstimateOptionsAction } from "./actions";

export default async function PublicEstimatePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accepted?: string; options?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const estimate = await getPublicEstimate(token);
  if (!estimate) notFound();

  const accepted = query.accepted === "1" || estimate.shareStatus === "accepted";

  return (
    <main className="public-page estimate-preview-page">
      <section className="public-shell">
        <p className="eyebrow">{estimate.organizationName}</p>
        <h1>{estimate.title}</h1>
        <p className="muted">
          Prepared for {estimate.customerName}. Review the work, total, payment terms, and next steps below.
        </p>

        {accepted ? (
          <div className="notice-card success-card section-actions">
            <strong>Estimate accepted</strong>
            <p className="muted">The business has been notified. They will confirm scheduling, materials, and any payment details.</p>
            {estimate.acceptanceReceipt ? (
              <div className="notice-card section-actions">
                <strong>Electronic signature receipt</strong>
                <p className="muted">Signed by {estimate.acceptanceReceipt.signedName} on {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(estimate.acceptanceReceipt.signedAt))}.</p>
                <p className="muted">Receipt {estimate.acceptanceReceipt.id}{estimate.acceptanceReceipt.documentVerification ? ` / Document ${estimate.acceptanceReceipt.documentVerification}` : ""}</p>
              </div>
            ) : null}
            {estimate.depositPaymentUrl ? (
              <a className="button section-actions" href={estimate.depositPaymentUrl}>
                Pay deposit
              </a>
            ) : estimate.depositRequired !== "$0" ? (
              <p className="muted">A deposit is required. The business can send the payment link after review.</p>
            ) : null}
          </div>
        ) : null}
        {query.options === "updated" ? <div className="success-card section-actions">Options and estimate total updated.</div> : null}

        <section className="panel section-actions">
          {estimate.customerIntro ? <p>{estimate.customerIntro}</p> : null}
          <div className="metric-card span-12">
            <small className="pill">estimated total</small>
            <strong>{estimate.total}</strong>
            <span>{estimate.paymentTerms || "Payment terms will be confirmed before work begins."}</span>
          </div>
        </section>

        <section className="grid section-actions">
          <section className="panel span-7">
            <h2>Scope Of Work</h2>
            <p className="muted">{estimate.customerScopeSummary || "Scope details are being finalized by the business."}</p>
            {estimate.customerExclusions ? (
              <>
                <h3>Not Included Unless Approved</h3>
                <p className="muted">{estimate.customerExclusions}</p>
              </>
            ) : null}
          </section>
          <section className="panel span-5">
            <h2>Next Steps</h2>
            <p className="muted">{estimate.customerNextSteps || "Accept the estimate or contact the business with questions."}</p>
            {estimate.acceptanceNotes ? <p className="muted">{estimate.acceptanceNotes}</p> : null}
            {estimate.depositRequired !== "$0" ? <p className="muted">Deposit: {estimate.depositRequired}</p> : null}
            <a className="button secondary-button" href={`/estimate/${token}/pdf`}>Download PDF</a>
            <p className="muted">You can also use your browser print option and choose Save as PDF.</p>
          </section>
        </section>

        <section className="panel section-actions">
          <h2>Estimate Items</h2>
          <form action={updateEstimateOptionsAction}>
            <input name="token" type="hidden" value={token} />
            <ul className="list">
            {estimate.lineItems.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>
                    {item.optional && !accepted ? (
                      <label className="inline-checkbox">
                        <input name="selectedItemId" type="checkbox" value={item.id} defaultChecked={item.selected} />
                        {item.name} <span className="pill">optional</span>
                      </label>
                    ) : item.name}
                  </h3>
                  {item.description ? <p className="muted">{item.description}</p> : null}
                  {estimate.showQuantities ? <p className="muted">Quantity: {item.quantity}</p> : null}
                </div>
                {estimate.showLineItemPrices ? (
                  <div className="inline-actions">
                    <span className="pill">{item.unitPrice}</span>
                    <span className="pill">{item.total}</span>
                  </div>
                ) : null}
              </li>
            ))}
            {estimate.lineItems.length === 0 ? <li className="list-row"><span className="muted">No line items are shown for this estimate.</span></li> : null}
            </ul>
            {!accepted && estimate.lineItems.some((item) => item.optional) ? <button className="mini-button section-actions" type="submit">Update options and total</button> : null}
          </form>
        </section>

        {!accepted ? (
          <section className="panel section-actions">
            <h2>Accept And Sign Estimate</h2>
            <form action={acceptEstimateAction} className="stacked-form">
              <input name="token" type="hidden" value={token} />
              <div className="form-grid two">
                <label>
                  Electronic signature (type your full name)
                  <input name="acceptedName" defaultValue={estimate.customerName} required />
                </label>
                <label>
                  Email
                  <input name="acceptedEmail" type="email" defaultValue={estimate.customerEmail} />
                </label>
              </div>
              <label>
                Note
                <textarea name="acceptanceNote" rows={3} placeholder="Optional note or scheduling preference" />
              </label>
              <label className="inline-checkbox">
                <input name="electronicSignatureConsent" type="checkbox" required />
                I agree to use an electronic signature and accept this estimate, its scope, price, payment terms, and stated conditions.
              </label>
              <p className="muted">Your signed receipt and a verification record will be emailed to you.</p>
              <button className="button" type="submit">Sign and accept estimate</button>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
