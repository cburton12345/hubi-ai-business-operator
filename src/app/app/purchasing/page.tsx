import { randomUUID } from "node:crypto";
import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPurchasingDashboard } from "@/lib/service-ops/get-purchasing-dashboard";
import {
  createVendorBillAction,
  queueAccountingSyncAction,
  receivePurchaseOrderItemAction,
  updateVendorBillStatusAction
} from "./actions";

export default async function PurchasingPage() {
  const dashboard = await getPurchasingDashboard();

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
                        {item.remaining > 0 ? (
                          <form action={receivePurchaseOrderItemAction} className="compact-form">
                            <input type="hidden" name="purchaseOrderItemId" value={item.id} />
                            <input type="hidden" name="receiptKey" value={`receipt_${randomUUID()}`} />
                            <input name="quantity" type="number" min="0.0001" max={item.remaining} step="0.0001" defaultValue={item.remaining} required />
                            <select name="locationId" defaultValue="">
                              <option value="">No stock location</option>
                              {dashboard.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                            </select>
                            <input name="packingSlip" placeholder="Packing slip (optional)" />
                            <button className="mini-button" type="submit">Receive</button>
                          </form>
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

        <section className="panel span-7">
          <h2>Vendor bills</h2>
          <ul className="list">
            {dashboard.bills.map((bill) => (
              <li className="list-row" key={bill.id}>
                <div><strong>{bill.number} · {bill.supplier}</strong><p className="muted">{bill.purchaseOrder} · due {bill.dueDate} · {bill.total}</p></div>
                <form action={updateVendorBillStatusAction} className="inline-actions">
                  <input type="hidden" name="billId" value={bill.id} />
                  <select name="status" defaultValue={bill.status}>
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="approved">Approved</option>
                    <option value="exported">Exported</option>
                    <option value="paid">Paid</option>
                    <option value="void">Void</option>
                  </select>
                  <button className="mini-button" type="submit">Update</button>
                </form>
              </li>
            ))}
            {dashboard.bills.length === 0 ? <li className="list-row"><span className="muted">No vendor bills recorded.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-5">
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
            <p className="muted">Queue records only when a business deliberately chooses a connected accounting provider.</p>
            <form action={queueAccountingSyncAction}><button className="mini-button" type="submit">Queue changed records</button></form>
          </details>
          <ul className="list section-actions">
            {dashboard.syncRuns.map((run) => (
              <li className="list-row" key={run.id}>
                <div><strong>{run.status}</strong><p className="muted">{run.createdAt} · {run.recordsSeen} records · {run.recordsFailed} failed</p></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="panel span-3 metric"><span className="muted">{label}</span><strong>{value}</strong></section>;
}
