import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceEstimateDetail } from "@/lib/service-ops/get-service-record-detail";

export default async function EstimatePreviewPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const estimate = await getServiceEstimateDetail(estimateId);
  if (!estimate) notFound();

  return (
    <main className="public-page estimate-preview-page">
      <section className="public-section">
        <div className="public-section-inner">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Customer estimate preview</p>
              <h1>{estimate.title}</h1>
              <p className="muted">{estimate.customerName}</p>
            </div>
            <div className="inline-actions">
              <span className="pill">{estimate.status}</span>
              <Link className="button secondary-button" href={`/app/service/estimates/${estimate.id}`}>Back to editor</Link>
            </div>
          </div>

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
              <p className="muted">
                {estimate.customerScopeSummary || estimate.customerSummary || "Scope details will appear here after the estimate is reviewed."}
              </p>
              {estimate.customerExclusions ? (
                <>
                  <h3>Not Included Unless Approved</h3>
                  <p className="muted">{estimate.customerExclusions}</p>
                </>
              ) : null}
            </section>
            <section className="panel span-5">
              <h2>Next Steps</h2>
              <p className="muted">
                {estimate.customerNextSteps || "Review this estimate, ask any questions, and approve the work when ready."}
              </p>
              {estimate.acceptanceNotes ? <p className="muted">{estimate.acceptanceNotes}</p> : null}
              {estimate.depositRequired !== "$0" ? <p className="muted">Deposit: {estimate.depositRequired}</p> : null}
            </section>
          </section>

          <section className="panel section-actions">
            <h2>Estimate Items</h2>
            <ul className="list">
              {estimate.lineItems.map((item) => (
                <li className="list-row" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
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
              {estimate.lineItems.length === 0 ? (
                <li className="list-row"><span className="muted">No customer line items are saved yet.</span></li>
              ) : null}
            </ul>
          </section>

          <section className="panel section-actions">
            <h2>Internal Preview Notes</h2>
            <p className="muted">
              This preview is for the signed-in team. Public sending, signatures, payment collection, and PDF delivery should stay behind the normal estimate approval and provider setup steps.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
