import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, DollarSign, Hammer, ReceiptText, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getJobTrackerDashboard } from "@/lib/job-tracker/get-job-tracker-dashboard";
import { createReceiptExpenseAction, createSimpleBidAction } from "./actions";

export default async function ConstructionSimpleModePage() {
  const dashboard = await getJobTrackerDashboard();

  return (
    <QueuePageShell
      eyebrow="Construction Simple Mode"
      title="What Needs To Get Done?"
      description="Create the estimate, keep the job moving, capture the cost, and collect the money. Ferocity keeps the detailed records behind the scenes."
    >
      <section className="panel construction-simple-hero">
        <div>
          <p className="eyebrow">Start here</p>
          <h2>Tell Ferocity what you are trying to finish.</h2>
          <p className="muted">
            Use the everyday actions below. Advanced estimating, materials, labor, accounting, and reporting
            are still available when someone needs them.
          </p>
        </div>
        <div className="button-row">
          <Link
            className="button"
            href="/app/ai-workforce?command=Help%20me%20create%20an%20estimate%2C%20update%20a%20job%2C%20record%20a%20cost%2C%20or%20collect%20money"
          >
            <Sparkles size={16} /> Ask Ferocity
          </Link>
          <Link className="button secondary-button" href="/app/job-tracker/full">
            Open full tools
          </Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Estimates waiting" value={dashboard.metrics.openBidCount} icon={<ClipboardList size={18} />} />
        <Metric label="Active jobs" value={dashboard.metrics.openJobs} icon={<Hammer size={18} />} />
        <Metric label="Customers owe" value={dashboard.metrics.moneyCustomersOwe} icon={<DollarSign size={18} />} />
        <Metric label="Receipts to review" value={dashboard.metrics.receiptsNeedReview} icon={<ReceiptText size={18} />} />
      </section>

      <section className="path-grid section-actions" aria-label="Construction quick actions">
        <Link className="path-card" href="/app/job-tracker/health">
          <AlertTriangle size={19} />
          <strong>Check Job Health</strong>
          <span>See what could cost time or money, with the exact records behind every warning.</span>
        </Link>
        <a className="path-card" href="#new-estimate">
          <ClipboardList size={19} />
          <strong>Create an estimate</strong>
          <span>Customer, job, scope, and price. Add the deeper details only when needed.</span>
        </a>
        <a className="path-card" href="#active-work">
          <Hammer size={19} />
          <strong>Check active work</strong>
          <span>See estimates and jobs that are already moving.</span>
        </a>
        <a className="path-card" href="#record-cost">
          <ReceiptText size={19} />
          <strong>Record a receipt</strong>
          <span>Snap it, tie it to a job, and keep the cost from getting lost.</span>
        </a>
        <Link className="path-card" href="/app/cash-collection">
          <DollarSign size={19} />
          <strong>Collect money</strong>
          <span>See customer balances, overdue invoices, reminders, and payment options.</span>
        </Link>
      </section>

      <section className="panel section-actions" id="new-estimate">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Quick estimate</p>
            <h2>Get the first draft out of your head.</h2>
            <p className="muted">
              This creates a real draft estimate. Open it afterward only if you need detailed takeoffs, terms,
              materials, options, or customer presentation controls.
            </p>
          </div>
          <Link className="mini-button" href="/app/estimator">Use advanced estimator</Link>
        </div>
        <form action={createSimpleBidAction} className="stacked-form construction-quick-form">
          <div className="form-grid two">
            <label>
              Existing customer
              <select name="customerId" defaultValue="">
                <option value="">New customer</option>
                {dashboard.formOptions.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
            <label>
              New customer name
              <input name="customerName" placeholder="Skip when using an existing customer" />
            </label>
          </div>
          <div className="form-grid two">
            <label>
              Job / estimate
              <input name="jobTitle" placeholder="Roof repair on Oak Street" required />
            </label>
            <label>
              Rough total
              <input name="item1UnitPrice" inputMode="decimal" placeholder="4,850.00" required />
            </label>
          </div>
          <input name="item1Name" type="hidden" value="Labor and materials" />
          <input name="item1Quantity" type="hidden" value="1" />
          <label>
            What work is included?
            <textarea
              name="item1Description"
              rows={4}
              placeholder="Remove damaged shingles, repair decking as needed, install underlayment and matching shingles, clean up debris."
              required
            />
          </label>
          <details className="subtle-panel construction-optional-fields">
            <summary>Add customer contact or internal notes</summary>
            <div className="form-grid two section-actions">
              <label>Customer email<input name="customerEmail" type="email" /></label>
              <label>Customer phone<input name="customerPhone" /></label>
            </div>
            <label>
              Internal notes
              <textarea name="notes" rows={3} placeholder="Access, insurance, timing, color, crew, or anything else to remember" />
            </label>
          </details>
          <button className="button" type="submit">Create draft estimate</button>
        </form>
      </section>

      <section className="feature-split" id="active-work">
        <article className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Estimates</p>
              <h2>Waiting for action</h2>
            </div>
            <Link className="mini-button" href="/app/job-tracker/full#simple-bid">All estimates</Link>
          </div>
          <ul className="list">
            {dashboard.bids.slice(0, 5).map((bid) => (
              <li className="list-row" key={bid.id}>
                <div>
                  <Link href={bid.href}><strong>{bid.title}</strong></Link>
                  <p className="muted">{bid.customerName} · {bid.status}</p>
                </div>
                <span className="pill">{bid.total}</span>
              </li>
            ))}
            {dashboard.bids.length === 0 ? <li className="list-row"><span className="muted">No estimates waiting.</span></li> : null}
          </ul>
        </article>

        <article className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Jobs</p>
              <h2>Currently moving</h2>
            </div>
            <Link className="mini-button" href="/app/service">All jobs</Link>
          </div>
          <ul className="list">
            {dashboard.jobs.slice(0, 5).map((job) => (
              <li className="list-row" key={job.id}>
                <div>
                  <Link href={job.href}><strong>{job.title}</strong></Link>
                  <p className="muted">{job.customerName} · {job.schedule}</p>
                </div>
                <span className="pill">{job.status.replaceAll("_", " ")}</span>
              </li>
            ))}
            {dashboard.jobs.length === 0 ? <li className="list-row"><span className="muted">No active jobs yet.</span></li> : null}
          </ul>
        </article>
      </section>

      <section className="panel section-actions" id="record-cost">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Quick receipt</p>
            <h2>Capture the cost before it disappears.</h2>
            <p className="muted">A photo and job are enough to start. Ferocity keeps it in review before using it in job profit.</p>
          </div>
          <Link className="mini-button" href="/app/job-tracker/full">Open receipt queue</Link>
        </div>
        <form action={createReceiptExpenseAction} className="stacked-form construction-quick-form">
          <div className="form-grid two">
            <label>
              Job
              <select name="serviceJobId" defaultValue="">
                <option value="">Choose a job if known</option>
                {dashboard.formOptions.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </label>
            <label>
              Vendor
              <input name="vendor" placeholder="Home Depot, Menards, fuel station" />
            </label>
          </div>
          <div className="form-grid two">
            <label>
              Amount
              <input name="amount" inputMode="decimal" placeholder="87.42" />
            </label>
            <label>
              Receipt photo
              <input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" />
            </label>
          </div>
          <label>
            Who paid?
            <select name="reimbursementStatus" defaultValue="not_reimbursable">
              <option value="not_reimbursable">Company paid · no reimbursement</option>
              <option value="submitted">Worker paid · needs reimbursement</option>
              <option value="paid">Worker already reimbursed</option>
            </select>
          </label>
          <input name="extractReceipt" type="hidden" value="on" />
          <button className="button" type="submit">Save receipt for review</button>
        </form>
      </section>

      <section className="panel simple-mode-next-step">
        <div>
          <p className="eyebrow">Need more detail?</p>
          <h2>Simple first. Full tools only when the job requires them.</h2>
          <p className="muted">
            Detailed takeoffs, materials, supplier pricing, labor, worker payments, reimbursements, margins,
            change orders, and reporting remain available without crowding this daily view.
          </p>
        </div>
        <Link className="button secondary-button" href="/app/job-tracker/full">
          Open full Job Tracker <ArrowRight size={16} />
        </Link>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <section className="panel span-3 metric">
      <div className="metric-label">{icon}<span>{label}</span></div>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}
