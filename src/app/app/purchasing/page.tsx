import { randomUUID } from "node:crypto";
import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import {
  getPurchasingDashboard,
  PurchasingDashboardUnavailableError,
} from "@/lib/service-ops/get-purchasing-dashboard";
import {
  createVendorBillAction,
  confirmSupplierReturnCreditAction,
  recordSupplierReturnAction,
  receivePurchaseOrderItemAction,
  updateVendorBillStatusAction
} from "./actions";

export default async function PurchasingPage() {
  let dashboard;
  try {
    dashboard = await getPurchasingDashboard();
  } catch (error) {
    if (!(error instanceof PurchasingDashboardUnavailableError)) throw error;
    return (
      <QueuePageShell
        eyebrow="Money"
        title="Purchasing And Accounting Desk"
        description="Receive purchase orders, match vendor bills, and export clean accounting files without provider credentials. Optional live sync remains separate."
      >
        <div className="notice warning" role="alert">
          <strong>Purchasing records are unavailable right now.</strong>
          <p>Ferocity could not verify the purchasing ledger, so it is not showing empty counts or claiming there are no orders, bills, returns, or supplier records. Retry after the database connection or required migration is available.</p>
        </div>
      </QueuePageShell>
    );
  }

  return (
    <QueuePageShell
      eyebrow="Money"
      title="Purchasing And Accounting Desk"
      description="Receive purchase orders, match vendor bills, and export clean accounting files without provider credentials. Optional live sync remains separate."
    >
      <div className="grid">
        <Metric label="Open orders" value={dashboard.metrics.openOrders} />
        <Metric label="Items to receive" value={dashboard.metrics.receivingNeeded} />
        <Metric label="Bills to review" value={dashboard.metrics.billsToReview} />
        <Metric label="Sync exceptions" value={dashboard.metrics.accountingExceptions} />

        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Purchase orders and receiving</h2>
              <p className="muted">A receipt updates the order and inventory ledger together when the item matches stock by SKU or name.</p>
            </div>
            <Link className="mini-button secondary-button" href="/app/estimator">Prepare order lists</Link>
          </div>
          <div className="grid">
            {dashboard.orders.map((order) => (
              <article className="panel span-6" key={order.id}>
                <div className="section-heading">
                  <div><span className="eyebrow">{order.supplier}</span><h3>{order.number}</h3></div>
                  <span className="pill">{order.status}</span>
                </div>
                <p>{order.job} · {order.total}</p>
                <p className="muted">Needed {order.requiredDate} · {order.receivedItems}/{order.itemCount} lines complete</p>
                <ul className="list">
                  {order.items.map((item) => (
                    <li className="list-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <p className="muted">{item.received}/{item.ordered} {item.unit} received{item.sku ? ` · ${item.sku}` : ""}</p>
                        {item.remaining > 0 && item.inventoryItemId ? (
                          <form action={receivePurchaseOrderItemAction} className="compact-form">
                            <input type="hidden" name="purchaseOrderItemId" value={item.id} />
                            <input type="hidden" name="inventoryItemId" value={item.inventoryItemId} />
                            <input type="hidden" name="receiptKey" value={`receipt_${randomUUID()}`} />
                            <input name="quantity" type="number" min="0.0001" max={item.remaining} step="0.0001" defaultValue={item.remaining} required />
                            <select name="locationId" defaultValue="" required>
                              <option value="" disabled>Stock location</option>
                              {dashboard.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                            </select>
                            <input name="packingSlip" placeholder="Packing slip (optional)" />
                            <button className="mini-button" type="submit">Receive</button>
                          </form>
                        ) : item.remaining > 0 ? (
                          <div className="notice warning">
                            <strong>Inventory match required</strong>
                            <p>Create or correct the matching inventory item before receiving this line. No receipt or stock movement has been recorded.</p>
                            <Link className="mini-button secondary-button" href="/app/service/inventory">Open inventory</Link>
                          </div>
                        ) : <span className="pill">received</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Record vendor bill</summary>
                  <form action={createVendorBillAction} className="stacked-form compact-form">
                    <input type="hidden" name="purchaseOrderId" value={order.id} />
                    <input name="billNumber" placeholder="Vendor invoice number" required />
                    <div className="form-grid two">
                      <label>Bill date<input name="billDate" type="date" /></label>
                      <label>Due date<input name="dueDate" type="date" /></label>
                      <label>Subtotal<input name="subtotal" type="number" min="0" step="0.01" required /></label>
                      <label>Tax<input name="tax" type="number" min="0" step="0.01" defaultValue="0" required /></label>
                    </div>
                    <textarea name="notes" maxLength={1000} placeholder="Reconciliation notes" />
                    <button className="mini-button" type="submit">Save for review</button>
                  </form>
                </details>
              </article>
            ))}
            {dashboard.orders.length === 0 ? <div className="empty-state span-12"><h3>No purchase orders yet</h3><p>Create a reviewed order list from the estimator.</p></div> : null}
          </div>
        </section>

        <section className="panel span-12">
          <h2>Supplier returns and credits</h2>
          <p className="muted">Returning stock removes only available units received on the selected receipt. A pending vendor credit stays pending until its reference and amount are confirmed.</p>
          <div className="grid section-actions">
            <div className="span-6">
              <h3>Return received stock</h3>
              <ul className="list">
                {dashboard.returnableReceipts.map((receipt) => (
                  <li className="list-row" key={receipt.receiptItemId}>
                    <div>
                      <strong>{receipt.itemName} · {receipt.supplier}</strong>
                      <p className="muted">{receipt.purchaseOrder} · {receipt.returnable} {receipt.unit} returnable</p>
                      <form action={recordSupplierReturnAction} className="compact-form section-actions">
                        <input name="receiptItemId" type="hidden" value={receipt.receiptItemId} />
                        <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                        <input name="quantity" type="number" min="0.0001" max={receipt.returnable} step="0.0001" placeholder="Quantity" required />
                        <select name="locationId" defaultValue={receipt.locationId ?? ""} required>
                          <option value="" disabled>Stock location</option>
                          {dashboard.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                        <input name="reason" placeholder="Return reason" required />
                        <button className="mini-button" type="submit">Record shipment to supplier</button>
                      </form>
                    </div>
                  </li>
                ))}
                {dashboard.returnableReceipts.length === 0 ? <li className="list-row"><span className="muted">No received stock is currently eligible for a supplier return.</span></li> : null}
              </ul>
            </div>
            <div className="span-6">
              <h3>Return history</h3>
              <ul className="list">
                {dashboard.supplierReturns.map((supplierReturn) => (
                  <li className="list-row" key={supplierReturn.id}>
                    <div>
                      <strong>{supplierReturn.itemName} · {supplierReturn.quantity}</strong>
                      <p className="muted">{supplierReturn.supplier} · sent {supplierReturn.createdAt} · expected {supplierReturn.expectedCredit}</p>
                      {supplierReturn.creditStatus === "pending" ? (
                        <form action={confirmSupplierReturnCreditAction} className="compact-form section-actions">
                          <input name="supplierReturnId" type="hidden" value={supplierReturn.id} />
                          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                          <select name="disposition" defaultValue="confirmed"><option value="confirmed">Credit confirmed</option><option value="not_expected">No credit expected</option></select>
                          <input name="amount" type="number" min="0" step="0.01" placeholder="Credit amount" />
                          <input name="reference" placeholder="Vendor credit reference" />
                          <button className="mini-button" type="submit">Record credit evidence</button>
                        </form>
                      ) : <span className="pill">{supplierReturn.creditStatus}{supplierReturn.confirmedCredit ? ` · ${supplierReturn.confirmedCredit}` : ""}{supplierReturn.creditReference ? ` · ${supplierReturn.creditReference}` : ""}</span>}
                    </div>
                  </li>
                ))}
                {dashboard.supplierReturns.length === 0 ? <li className="list-row"><span className="muted">No supplier returns recorded.</span></li> : null}
              </ul>
            </div>
          </div>
        </section>

        <section className="panel span-6">
          <h2>Vendor bills</h2>
          <ul className="list">
            {dashboard.bills.map((bill) => (
              <li className="list-row" key={bill.id}>
                <div>
                  <strong>{bill.number} · {bill.supplier}</strong>
                  <p className="muted">{bill.purchaseOrder} · due {bill.dueDate} · {bill.total}</p>
                  <p className={bill.reconciliationStatus === "matched" ? "muted" : "danger-text"}>
                    {bill.reconciliationStatus === "matched"
                      ? `Matched to ${bill.expectedSubtotal}`
                      : `Needs reconciliation: expected ${bill.expectedSubtotal}; variance ${bill.variance}`}
                  </p>
                </div>
                {bill.status === "exported" || bill.status === "paid" ? (
                  <span className="pill">{bill.status}</span>
                ) : (
                  <form action={updateVendorBillStatusAction} className="inline-actions">
                    <input type="hidden" name="billId" value={bill.id} />
                    <select name="status" defaultValue={bill.status}>
                      <option value="draft">Draft</option>
                      <option value="review">Review</option>
                      <option value="approved" disabled={bill.reconciliationStatus !== "matched"}>Approved</option>
                      <option value="void">Void</option>
                    </select>
                    <button className="mini-button" type="submit">Update</button>
                  </form>
                )}
              </li>
            ))}
            {dashboard.bills.length === 0 ? <li className="list-row"><span className="muted">No vendor bills recorded.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Unresolved bill and purchase-order matches</h2>
          <p className="muted">Ferocity ranks possible purchase orders from supplier, reference, total, and date evidence. A suggestion never links or approves a bill by itself.</p>
          <ul className="list">
            {dashboard.unmatchedDocuments.map((document) => (
              <li className="list-row" key={document.id}>
                <div>
                  <strong>{document.fileName} · {document.vendor}</strong>
                  <p className="muted">{document.number} · {document.total} · unresolved</p>
                  {document.candidates.length ? <ol>
                    {document.candidates.map((candidate) => <li key={candidate.id}>
                      <strong>{candidate.purchaseOrderNumber} · {candidate.supplierName ?? "Supplier not identified"}</strong>
                      <span className="muted"> · {candidate.total} · {candidate.confidence} confidence · {candidate.evidence.join("; ")}</span>
                    </li>)}
                  </ol> : <p className="notice warning">No purchase order has enough matching evidence. Leave this unresolved until the source record is identified.</p>}
                </div>
                <Link className="mini-button" href={`/app/expenses?q=${encodeURIComponent(document.number === "Document number not identified" ? document.fileName : document.number)}`}>Review source</Link>
              </li>
            ))}
            {dashboard.unmatchedDocuments.length === 0 ? <li className="list-row"><span className="muted">No unresolved bill documents are waiting for a purchase-order match.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Portable accounting</h2>
          <p className="muted">Download reviewable CSV files now. QuickBooks, spreadsheets, and other accounting systems can import them without giving Ferocity API credentials.</p>
          <div className="button-row">
            <Link className="mini-button" href={`/api/reports/profit-loss?year=${new Date().getFullYear()}&basis=cash`}>Cash P&amp;L</Link>
            <Link className="mini-button" href="/api/reports/accounting-export?dataset=invoices">Invoice CSV</Link>
            <Link className="mini-button secondary-button" href="/api/reports/accounting-export?dataset=vendor-bills">Vendor bills</Link>
            <Link className="mini-button secondary-button" href="/api/reports/accounting-export?dataset=ledger">Ledger</Link>
            <Link className="mini-button secondary-button" href="/app/reports">Tax export center</Link>
          </div>
          <details className="section-actions">
            <summary>Optional live accounting sync</summary>
            <p className="notice warning">Live QuickBooks synchronization is not enabled. Use the reviewed CSV exports above; Ferocity will not create a queue that has no certified provider worker.</p>
          </details>
          <ul className="list section-actions">
            {dashboard.syncRuns.map((run) => (
              <li className="list-row" key={run.id}>
                <div><strong>{run.status}</strong><p className="muted">{run.createdAt} · {run.recordsSeen} records · {run.recordsFailed} failed</p></div>
              </li>
            ))}
          </ul>
        </section>

        <details className="panel span-12 progressive-disclosure">
          <summary><div><h2>Supplier alternatives and price history</h2><p className="muted">Evidence-ranked options; never an automatic order.</p></div></summary>
          <div className="progressive-disclosure-body form-stack">
            {dashboard.supplierSources.map((group) => <section key={group.key}>
              <h3>{group.label}</h3>
              <p className="muted">{group.historyCount} recorded price observation{group.historyCount === 1 ? "" : "s"}</p>
              <ol>{group.options.map((option) => <li key={option.supplierProductId}>
                <strong>{option.supplierName} · {option.price}</strong>
                <span className="muted"> · score {option.score} · {option.evidence.join("; ")} · approval required before ordering</span>
              </li>)}</ol>
            </section>)}
            {dashboard.supplierSources.length === 0 ? <p className="muted">No product currently has two evidence-backed supplier options. Import or connect additional price sources to compare them.</p> : null}
          </div>
        </details>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="panel span-3 metric"><span className="muted">{label}</span><strong>{value}</strong></section>;
}
