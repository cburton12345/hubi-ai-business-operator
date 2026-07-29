import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getEstimatorTakeoffDetail } from "@/lib/estimator/get-estimator-takeoff-detail";
import { createBidFromTakeoffAction, createOrderListFromTakeoffAction, prepareSupplierOrderReadinessAction } from "../../actions";

function tone(value: string) {
  if (["blocking", "high", "needs_measurements", "blocked"].includes(value)) return "high";
  if (["medium", "needs_review", "draft"].includes(value)) return "medium";
  return "";
}

export default async function TakeoffDetailPage({ params }: { params: Promise<{ takeoffId: string }> }) {
  const { takeoffId } = await params;
  const takeoff = await getEstimatorTakeoffDetail(takeoffId);
  if (!takeoff) notFound();

  return (
    <QueuePageShell
      eyebrow="Material Takeoff"
      title={takeoff.estimateTitle}
      description={`${takeoff.customerName} / ${takeoff.tradeKey.replaceAll("_", " ")} / ${takeoff.recommendedPrice}`}
    >
      <section className="grid section-actions">
        <Metric label="Materials" value={takeoff.materialCost} />
        <Metric label="Labor" value={takeoff.laborCost} />
        <Metric label="Markup" value={takeoff.markup} />
        <Metric label="Bid target" value={takeoff.recommendedPrice} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Review before sending</p>
            <h2>Estimator Summary</h2>
            <p className="muted">
              Status: {takeoff.status} / Quality: {takeoff.qualityLevel} / Confidence: {takeoff.confidence}
            </p>
            {takeoff.jobAddress ? <p className="muted">Job address: {takeoff.jobAddress}</p> : null}
          </div>
          <div className="inline-actions">
            {takeoff.estimateId ? <Link className="button secondary-button" href={`/app/service/estimates/${takeoff.estimateId}`}>Open estimate</Link> : null}
            <form action={createBidFromTakeoffAction}>
              <input type="hidden" name="takeoffId" value={takeoff.id} />
              <button className="button" type="submit">Create bid draft</button>
            </form>
            <form action={createOrderListFromTakeoffAction}>
              <input type="hidden" name="takeoffId" value={takeoff.id} />
              <button className="button secondary-button" type="submit">Generate order list</button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <h2>Material Items</h2>
          <ul className="list">
            {takeoff.items.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.label}</h3>
                  <p className="muted">
                    {item.category} / {item.roundedPurchaseQuantity} {item.unit} to buy / {item.total}
                  </p>
                  {item.formula ? <p className="muted">Formula: {item.formula}</p> : null}
                  {item.assumptions.length ? <p className="muted">Assumptions: {item.assumptions.join(", ")}</p> : null}
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(item.status)}`}>{item.status}</span>
                  <span className="pill">{item.confidence}</span>
                  <span className="pill">{item.unitPrice}</span>
                </div>
              </li>
            ))}
            {takeoff.items.length === 0 ? <li className="list-row"><span className="muted">No material items were calculated for this takeoff.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>Warnings And Missing Info</h2>
          <ul className="list">
            {takeoff.missingInformation.map((item) => (
              <li className="list-row" key={item}>
                <span>{item}</span>
                <span className="pill medium">needed</span>
              </li>
            ))}
            {takeoff.warnings.map((warning) => (
              <li className="list-row" key={warning.id}>
                <div>
                  <h3>{warning.severity}</h3>
                  <p className="muted">{warning.message}</p>
                </div>
                <span className={`pill ${tone(warning.severity)}`}>{warning.status}</span>
              </li>
            ))}
            {!takeoff.missingInformation.length && !takeoff.warnings.length ? (
              <li className="list-row"><span className="muted">No missing info or warnings recorded.</span></li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Original Input</h2>
          <p className="muted">{takeoff.originalInput || "No original note saved."}</p>
        </section>
        <section className="panel span-6">
          <h2>Interpreted Input</h2>
          <p className="muted">{takeoff.interpretedInput || "No interpreted note saved."}</p>
        </section>
      </section>

      <section className="panel section-actions">
        <h2>Purchase Orders And Live Ordering</h2>
        <p className="muted">
          Ferocity can prepare order lists now. Live supplier ordering stays blocked until supplier account/API access, current pricing, SKUs, delivery rules, and approval are ready.
        </p>
        <ul className="list section-actions">
          {takeoff.purchaseOrders.map((order) => (
            <li className="list-row" key={order.id}>
              <div>
                <h3>{order.jobName}</h3>
                <p className="muted">{order.supplierName} / {order.total}</p>
                {order.blockedReason ? <p className="muted">{order.blockedReason}</p> : null}
              </div>
              <div className="inline-actions">
                <span className={`pill ${tone(order.readiness)}`}>{order.readiness}</span>
                <span className="pill">{order.status}</span>
                <form action={prepareSupplierOrderReadinessAction}>
                  <input name="id" type="hidden" value={order.id} />
                  <button className="mini-button secondary-button" type="submit">Check order readiness</button>
                </form>
              </div>
            </li>
          ))}
          {takeoff.purchaseOrders.length === 0 ? (
            <li className="list-row"><span className="muted">No order list has been generated for this takeoff yet.</span></li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric-card span-3">
      <small className="pill">takeoff</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
