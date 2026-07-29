import Link from "next/link";
import { BellRing, CalendarDays, ClipboardList, DollarSign, Hammer, MessageSquareText, Package, ReceiptText, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getJobTrackerDashboard } from "@/lib/job-tracker/get-job-tracker-dashboard";
import {
  createSimpleBidAction,
  createMaterialListItemAction,
  createReceiptExpenseAction,
  createWorkerPaymentAction,
  updateMaterialStatusAction,
  updateReceiptExpenseAction,
  updateWorkerPaymentStatusAction
} from "../actions";

function tone(status: string) {
  return ["planned", "needed", "ordered", "draft", "sent_manually", "unscheduled"].includes(status)
    ? "medium"
    : ["void", "cancelled", "declined", "lost"].includes(status)
      ? "high"
      : "";
}

export default async function JobTrackerPage() {
  const dashboard = await getJobTrackerDashboard();

  return (
    <QueuePageShell
      eyebrow="Jobs & Money"
      title="Track Bids, Job Costs, People Paid, And Materials"
      description="A simple working tier for bids, job costs, receipts, people paid, materials, payment terms, reminders, and profit visibility."
    >
      <section className="grid section-actions">
        <Metric label="Open jobs" value={dashboard.metrics.openJobs} icon={<Hammer size={18} />} />
        <Metric label="Open bids" value={dashboard.metrics.openBidCount} icon={<ClipboardList size={18} />} />
        <Metric label="Open bid value" value={dashboard.metrics.openBidValue} icon={<DollarSign size={18} />} />
        <Metric label="Approved bid value" value={dashboard.metrics.approvedBidValue} icon={<ReceiptText size={18} />} />
        <Metric label="Paid to people, 30 days" value={dashboard.metrics.paidToPeople30d} icon={<Users size={18} />} />
        <Metric label="Planned people payments" value={dashboard.metrics.unpaidPeoplePlanned} icon={<Users size={18} />} />
        <Metric label="Payback pending" value={dashboard.metrics.reimbursementPending} icon={<ReceiptText size={18} />} />
        <Metric label="Owner review" value={dashboard.metrics.receiptsNeedReview} icon={<ReceiptText size={18} />} />
        <Metric label="Customers owe" value={dashboard.metrics.moneyCustomersOwe} icon={<DollarSign size={18} />} />
        <Metric label="Overdue invoices" value={dashboard.metrics.overdueInvoices} icon={<ReceiptText size={18} />} />
        <Metric label="Materials needed" value={dashboard.metrics.materialItemsNeeded} icon={<Package size={18} />} />
        <Metric label="Job costs, 30 days" value={dashboard.metrics.jobCosts30d} icon={<ReceiptText size={18} />} />
        <Metric label="Tracked profit, 30 days" value={dashboard.metrics.profitTracked30d} icon={<DollarSign size={18} />} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">How to use this</p>
            <h2>One place for the money side of jobs.</h2>
            <p className="muted">
              Estimates are the bids. Jobs show what was bid, invoiced, paid, spent on materials, expenses, reimbursements, and people. Ferocity also flags money customers owe and costs waiting for owner review.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button secondary-button" href="/app/service-command">Work</Link>
            <Link className="button secondary-button" href="/app/text-queue">Text Queue</Link>
            <Link className="button secondary-button" href="/app/operations-workforce">Workforce</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Simple mode</p>
            <h2>Useful even before a business turns on the full AI operating system.</h2>
            <p className="muted">
              This tier is for owners or crews who mainly need to know what was bid, what was bought, who got paid,
              who still owes money, and whether a job is actually profitable.
            </p>
          </div>
          <Link className="button" href="/app/ai-workforce?command=Help%20me%20set%20up%20job%20tracking%2C%20materials%2C%20receipts%2C%20payments%2C%20and%20reminders">
            Have AI set this up
          </Link>
        </div>
        <div className="value-ladder">
          {[
            ["Bids", "Create a simple bid, customer view, line items, terms, deposit, and internal notes."],
            ["Materials", "Build starter material lists and track needed, ordered, delivered, used, or returned items."],
            ["Receipts", "Track vendor, category, job, reimbursement status, tax category, and owner review."],
            ["People paid", "Record payroll, subcontractor, draw, bonus, and reimbursement payments by job."],
            ["Money owed", "See balances, overdue invoices, reminders, manual payments, and collection follow-up."],
            ["Profit view", "Compare bid, invoiced, paid in, materials, expenses, people paid, and gross left."]
          ].map(([title, body]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Contractor workflow</p>
            <h2>Quote it, schedule it, work it, collect it, and remember every follow-up.</h2>
            <p className="muted">
              This is the simple mode for crews that need bids, materials, people paid, customer balances, reminders,
              and profit visibility without opening ten different tools.
            </p>
          </div>
          <Link className="button" href="/app/attention-command">
            <BellRing size={16} /> Today
          </Link>
        </div>
        <div className="path-grid">
          <Link className="path-card" href="#simple-bid">
            <ClipboardList size={18} />
            <strong>Create bid</strong>
            <span>Customer, scope, line items, terms, deposit, and starter materials.</span>
          </Link>
          <Link className="path-card" href="/app/service-command">
            <CalendarDays size={18} />
            <strong>Schedule work</strong>
            <span>Move approved work into the service loop, routes, tech view, or workforce plan.</span>
          </Link>
          <Link className="path-card" href="/app/text-queue">
            <MessageSquareText size={18} />
            <strong>Follow up</strong>
            <span>Use prepared one-to-one texts for estimates, bills, job updates, and reminders.</span>
          </Link>
          <Link className="path-card" href="/app/cash-collection">
            <DollarSign size={18} />
            <strong>Collect money</strong>
            <span>Track balances, manual payment records, invoice reminders, overdue work, and Stripe payment links when configured.</span>
          </Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Quick entry</p>
            <h2>Make a bid without digging through the full CRM.</h2>
            <p className="muted">
              Add a customer, scope, line items, payment terms, deposit, and starter material list. This creates a real Ferocity estimate.
            </p>
          </div>
          <Link className="mini-button" href="/pricing">Job Tracker tier</Link>
        </div>
        <form id="simple-bid" action={createSimpleBidAction} className="stacked-form">
          <div className="form-grid two">
            <label>
              Existing customer
              <select name="customerId" defaultValue="">
                <option value="">Create or type customer below</option>
                {dashboard.formOptions.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
            <label>
              Job / bid title
              <input name="jobTitle" placeholder="Roof repair on Oak Street" required />
            </label>
          </div>
          <div className="form-grid three">
            <label>
              New customer name
              <input name="customerName" placeholder="Only needed for new customer" />
            </label>
            <label>
              Customer email
              <input name="customerEmail" type="email" />
            </label>
            <label>
              Customer phone
              <input name="customerPhone" />
            </label>
          </div>
          <div className="form-grid three">
            <label>
              Payment terms
              <input name="paymentTerms" placeholder="50% deposit, balance due on completion" />
            </label>
            <label>
              Deposit required
              <input name="deposit" inputMode="decimal" placeholder="1500.00" />
            </label>
            <label>
              Bid good until
              <input name="validUntil" type="date" />
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bid item</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6].map((number) => (
                  <tr key={number}>
                    <td><input name={`item${number}Name`} placeholder={number === 1 ? "Labor and materials" : "Optional item"} required={number === 1} /></td>
                    <td><input name={`item${number}Description`} placeholder="Scope notes" /></td>
                    <td><input name={`item${number}Quantity`} defaultValue={number === 1 ? "1" : ""} inputMode="decimal" /></td>
                    <td><input name={`item${number}UnitPrice`} placeholder="0.00" inputMode="decimal" required={number === 1} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="panel subtle-panel">
            <summary>Optional material list</summary>
            <div className="table-scroll section-actions">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((number) => (
                    <tr key={number}>
                      <td><input name={`material${number}Name`} placeholder={number === 1 ? "Shingles" : "Optional material"} /></td>
                      <td><input name={`material${number}Quantity`} inputMode="decimal" /></td>
                      <td><input name={`material${number}Unit`} placeholder="squares, bundles, hours" /></td>
                      <td><input name={`material${number}Cost`} inputMode="decimal" placeholder="0.00" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <label>
            Internal notes
            <textarea name="notes" rows={3} placeholder="Insurance notes, color, access, timing, anything your partner needs to remember" />
          </label>
          <button className="button" type="submit">Create simple bid</button>
        </form>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <div className="list-row flush-row">
            <div>
              <h2>Job Money Board</h2>
              <p className="muted">Use this to spot jobs where costs, labor, or materials are eating up the bid.</p>
            </div>
            <Link className="mini-button" href="/app/service">Add job</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Bid</th>
                  <th>Invoiced</th>
                  <th>Paid in</th>
                  <th>Expenses</th>
                  <th>Materials</th>
                  <th>People</th>
                  <th>Reimburse</th>
                  <th>Owed</th>
                  <th>Left</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={job.href}>{job.title}</Link>
                      <span className="muted block">{job.customerName} / {job.status}</span>
                    </td>
                    <td>{job.bidTotal}</td>
                    <td>{job.invoicedTotal}</td>
                    <td>{job.invoicePaid}</td>
                    <td>{job.expenseTotal}</td>
                    <td>{job.materialTotal}</td>
                    <td>{job.peoplePaid}</td>
                    <td>{job.reimbursableReceipts}</td>
                    <td>{job.invoiceBalance}</td>
                    <td><strong>{job.grossLeft}</strong></td>
                    <td>{job.margin}</td>
                  </tr>
                ))}
                {dashboard.jobs.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No jobs yet. Create a customer, estimate, and job from Work Records.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-5">
          <h2>Add Payment To Person</h2>
          <p className="muted">Record payroll, subcontractor, draw, bonus, or reimbursement payments tied to a job when possible.</p>
          <form action={createWorkerPaymentAction} className="stacked-form">
            <label>
              Payee name
              <input name="payeeName" placeholder="Crew member, subcontractor, helper" required />
            </label>
            <label>
              Worker
              <select name="workerId" defaultValue="">
                <option value="">No worker linked</option>
                {dashboard.formOptions.workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </label>
            <label>
              Job
              <select name="serviceJobId" defaultValue="">
                <option value="">No job linked</option>
                {dashboard.formOptions.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                Amount
                <input name="amount" inputMode="decimal" placeholder="450.00" />
              </label>
              <label>
                Date
                <input name="paymentDate" type="date" />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Type
                <select name="paymentType" defaultValue="payroll">
                  <option value="payroll">Payroll</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="bonus">Bonus</option>
                  <option value="reimbursement">Reimbursement</option>
                  <option value="draw">Draw</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue="recorded">
                  <option value="planned">Planned</option>
                  <option value="recorded">Recorded</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="void">Void</option>
                </select>
              </label>
            </div>
            <label>
              Method
              <select name="method" defaultValue="manual">
                <option value="manual">Manual note</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="ach">ACH</option>
                <option value="card">Card</option>
                <option value="payroll_provider">Payroll provider</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Notes
              <textarea name="notes" rows={3} placeholder="What this payment covered" />
            </label>
            <button className="button" type="submit">Save payment</button>
          </form>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Submit Payback Request</h2>
          <p className="muted">
            Snap a receipt or add the details by hand. Ferocity keeps it in owner review, then uses approved costs for job profit,
            tax categories, reimbursement tracking, and P&L totals. AI receipt extraction can fill details when the provider is configured.
          </p>
          <form action={createReceiptExpenseAction} className="stacked-form">
            <label>
              Worker
              <select name="workerId" defaultValue="">
                <option value="">No worker linked</option>
                {dashboard.formOptions.workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </label>
            <label>
              Job
              <select name="serviceJobId" defaultValue="">
                <option value="">No job linked</option>
                {dashboard.formOptions.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                Vendor
                <input name="vendor" placeholder="Menards, Home Depot, gas station" />
              </label>
              <label>
                Category
                <input name="category" placeholder="Materials, fuel, tools" />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Amount
                <input name="amount" inputMode="decimal" placeholder="87.42" />
              </label>
              <label>
                Tax
                <input name="tax" inputMode="decimal" placeholder="0.00" />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Purchase date
                <input name="expenseDate" type="date" />
              </label>
              <label>
                City
                <input name="city" placeholder="Eau Claire" />
              </label>
            </div>
            <label>
              State
              <input name="state" placeholder="WI" />
            </label>
            <label>
              Receipt photo
              <input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" />
              <span className="field-help">On a phone, this can open the camera. Upload stays private and owner-reviewed.</span>
            </label>
            <div className="form-grid two">
              <label>
                Reimbursement status
                <select name="reimbursementStatus" defaultValue="submitted">
                  <option value="submitted">Needs paid back</option>
                  <option value="approved">Approved to pay</option>
                  <option value="paid">Already paid back</option>
                  <option value="not_reimbursable">Company card / no payback</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                Pay back by
                <input name="reimbursementDueDate" type="date" />
              </label>
            </div>
            <label>
              Proof URL
              <input name="receiptUrl" type="url" placeholder="Optional shared photo or proof link" />
            </label>
            <label className="check-row">
              <input name="extractReceipt" type="checkbox" />
              Draft vendor, total, category, date, and location from the receipt details
            </label>
            <label>
              Notes
              <textarea name="notes" rows={3} placeholder="What was bought, why, and whether it needs paid back" />
            </label>
            <button className="button" type="submit">Save payback request</button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="list-row flush-row">
            <div>
              <h2>Payback Queue</h2>
              <p className="muted">Costs waiting for owner review, approval, or payback.</p>
            </div>
            <Link className="mini-button" href="/app/operations-workforce">Field cost tools</Link>
          </div>
          <ul className="list">
            {dashboard.receiptExpenses.map((expense) => (
              <li className="list-row" key={expense.id}>
                <div>
                  <h3>{expense.vendor} / {expense.amount}</h3>
                  <p className="muted">{expense.workerName} / {expense.jobTitle} / {expense.category} / due {expense.dueDate}</p>
                  {expense.notes ? <p>{expense.notes}</p> : null}
                </div>
                <form action={updateReceiptExpenseAction} className="inline-actions">
                  <input type="hidden" name="id" value={expense.id} />
                  <select name="status" defaultValue={expense.status} aria-label={`Expense status for ${expense.vendor}`}>
                    <option value="needs_review">Needs review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="exported">Exported</option>
                  </select>
                  <select name="reimbursementStatus" defaultValue={expense.reimbursementStatus} aria-label={`Reimbursement status for ${expense.vendor}`}>
                    <option value="not_reimbursable">No payback</option>
                    <option value="submitted">Needs paid back</option>
                    <option value="approved">Approved to pay</option>
                    <option value="paid">Paid back</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button className="mini-button" type="submit">Update</button>
                  <a className={`mini-button secondary-button ${expense.canText ? "" : "disabled-link"}`} href={expense.smsHref} aria-disabled={!expense.canText}>
                    Text update
                  </a>
                </form>
              </li>
            ))}
            {dashboard.receiptExpenses.length === 0 ? <li className="list-row"><span className="muted">No payback requests submitted yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Bids Given</h2>
              <p className="muted">These come from Ferocity estimates so bids and jobs stay connected.</p>
            </div>
            <Link className="mini-button" href="/app/service">Create estimate</Link>
          </div>
          <ul className="list">
            {dashboard.bids.map((bid) => (
              <li className="list-row" key={bid.id}>
                <div>
                  <h3><Link href={bid.href}>{bid.title}</Link></h3>
                  <p className="muted">{bid.customerName} / created {bid.createdAt} / valid {bid.validUntil}</p>
                </div>
                <div className="inline-actions">
                  <strong>{bid.total}</strong>
                  <span className={`pill ${tone(bid.status)}`}>{bid.status}</span>
                </div>
              </li>
            ))}
            {dashboard.bids.length === 0 ? <li className="list-row"><span className="muted">No bids yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Material List</h2>
          <p className="muted">Track what is needed, ordered, purchased, used, returned, or cancelled.</p>
          <form action={createMaterialListItemAction} className="stacked-form compact-form">
            <label>
              Material
              <input name="materialName" placeholder="Shingles, underlayment, dumpster, nails" required />
            </label>
            <label>
              Job
              <select name="serviceJobId" defaultValue="">
                <option value="">No job linked</option>
                {dashboard.formOptions.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </label>
            <div className="form-grid three">
              <label>
                Qty
                <input name="quantity" inputMode="decimal" placeholder="24" />
              </label>
              <label>
                Unit
                <input name="unit" placeholder="squares" />
              </label>
              <label>
                Status
                <select name="status" defaultValue="needed">
                  <option value="needed">Needed</option>
                  <option value="ordered">Ordered</option>
                  <option value="purchased">Purchased</option>
                  <option value="used">Used</option>
                  <option value="returned">Returned</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Estimated cost
                <input name="estimatedCost" inputMode="decimal" placeholder="1200.00" />
              </label>
              <label>
                Actual cost
                <input name="actualCost" inputMode="decimal" placeholder="1185.00" />
              </label>
            </div>
            <label>
              Notes
              <textarea name="notes" rows={2} placeholder="Supplier, color, pickup notes, delivery timing" />
            </label>
            <button className="button" type="submit">Add material</button>
          </form>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>People Payments</h2>
          <ul className="list">
            {dashboard.workerPayments.map((payment) => (
              <li className="list-row" key={payment.id}>
                <div>
                  <h3>{payment.payeeName}</h3>
                  <p className="muted">{payment.jobTitle} / {payment.paymentType} / {payment.method} / {payment.paymentDate}</p>
                  {payment.notes ? <p>{payment.notes}</p> : null}
                </div>
                <form action={updateWorkerPaymentStatusAction} className="inline-actions">
                  <input type="hidden" name="id" value={payment.id} />
                  <strong>{payment.amount}</strong>
                  <select name="status" defaultValue={payment.status} aria-label={`Status for ${payment.payeeName}`}>
                    <option value="planned">Planned</option>
                    <option value="recorded">Recorded</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="void">Void</option>
                  </select>
                  <button className="mini-button" type="submit">Update</button>
                </form>
              </li>
            ))}
            {dashboard.workerPayments.length === 0 ? <li className="list-row"><span className="muted">No people payments recorded yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Material Status</h2>
          <ul className="list">
            {dashboard.materialItems.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.materialName}</h3>
                  <p className="muted">{item.jobTitle} / {item.quantity} / estimated {item.estimatedCost} / actual {item.actualCost}</p>
                  {item.notes ? <p>{item.notes}</p> : null}
                </div>
                <form action={updateMaterialStatusAction} className="inline-actions">
                  <input type="hidden" name="id" value={item.id} />
                  <select name="status" defaultValue={item.status} aria-label={`Status for ${item.materialName}`}>
                    <option value="needed">Needed</option>
                    <option value="ordered">Ordered</option>
                    <option value="purchased">Purchased</option>
                    <option value="used">Used</option>
                    <option value="returned">Returned</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button className="mini-button" type="submit">Update</button>
                </form>
              </li>
            ))}
            {dashboard.materialItems.length === 0 ? <li className="list-row"><span className="muted">No materials listed yet.</span></li> : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <section className="metric-card span-3">
      <small className="pill">jobs</small>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
