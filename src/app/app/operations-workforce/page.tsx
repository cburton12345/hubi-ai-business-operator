import Link from "next/link";
import type { ReactNode } from "react";
import { BriefcaseBusiness, Clock, DollarSign, MapPin, ReceiptText, Route, Search, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import {
  approveCustomerUpdateDraftAction,
  clockOutTimeEntryAction,
  createAssignmentAction,
  createClockInAction,
  createCustomerUpdateDraftAction,
  createExpenseAction,
  createRecurringExpenseAction,
  createFieldMediaAction,
  createLocationPingAction,
  createMaterialLogAction,
  createMileageAction,
  createPayrollExportAction,
  markPayrollExportReadyAction,
  markPayrollExportedAction,
  sendCustomerUpdateDraftAction,
  createWorkerAction,
  updateRecurringExpenseStatusAction
} from "./actions";

export default async function OperationsWorkforcePage() {
  const dashboard = await getOperationsWorkforceDashboard();

  return (
    <QueuePageShell
      eyebrow="Operations"
      title="Operations & Workforce Management"
      description="Dispatch people, crews, tasks, time, field costs, mileage, materials, and job costs without turning Ferocity into a payroll processor."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Workforce shortcuts</p>
            <h2>What do you need to do?</h2>
            <p className="muted">Jump straight to the field and office actions instead of scrolling through the whole operations system.</p>
          </div>
          <Link className="mini-button" href="/app/owner-command-center">Owner view</Link>
        </div>
        <div className="path-grid">
          <Link className="path-card" href="#time-clock">
            <Clock size={18} />
            <strong>Punch in / out</strong>
            <span>Start or end time, add location, breaks, and notes.</span>
          </Link>
          <Link className="path-card" href="#schedule">
            <MapPin size={18} />
            <strong>Schedule work</strong>
            <span>Create a dispatch assignment and see daily or weekly work.</span>
          </Link>
          <Link className="path-card" href="/app/labor-bench">
            <Search size={18} />
            <strong>I need workers</strong>
            <span>Request employees or subcontractors, match availability, and approve contact.</span>
          </Link>
          <Link className="path-card" href="#field-work">
            <ReceiptText size={18} />
            <strong>Field costs and proof</strong>
            <span>Track expenses, miles, material use, photos, videos, and documents.</span>
          </Link>
          <Link className="path-card" href="#customer-updates">
            <Users size={18} />
            <strong>Customer update</strong>
            <span>Draft arrival, delay, completion, or proof-ready messages.</span>
          </Link>
          <Link className="path-card" href="#payroll">
            <DollarSign size={18} />
            <strong>Payroll review</strong>
            <span>Prepare exports after time and costs are checked.</span>
          </Link>
        </div>
      </section>

      <div className="grid section-actions">
        <Metric label="Working now" value={dashboard.metrics.workingNow} />
        <Metric label="Scheduled today" value={dashboard.metrics.scheduledToday} />
        <Metric label="Open assignments" value={dashboard.metrics.openAssignments} />
        <Metric label="Needs review" value={dashboard.metrics.needsReview} />
        <Metric label="Payroll hours" value={dashboard.metrics.payrollHours} />
        <Metric label="Expenses" value={dashboard.metrics.expenses} />
        <Metric label="Mileage" value={dashboard.metrics.mileage} />
        <Metric label="Tracked job cost" value={dashboard.metrics.jobCost} />
        <Metric label="Field proof" value={dashboard.metrics.fieldProof} />
        <Metric label="Customer drafts" value={dashboard.metrics.customerDrafts} />
        <Metric label="Payroll exports" value={dashboard.metrics.payrollExports} />
        <Metric label="Recurring expenses" value={dashboard.metrics.recurringExpenses} />
        <Metric label="Due soon" value={dashboard.metrics.recurringDue} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>AI Executive Dashboard</h2>
            <p className="muted">
              See who is working, what needs review, where the money is going, and which jobs need attention. Payroll and accounting exports stay held until someone reviews them.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/service">Work Records</Link>
            <Link className="mini-button" href="/app/ai-walkthrough">AI Walkthrough</Link>
            <Link className="mini-button" href="/app/owner-command-center">Owner Events</Link>
          </div>
        </div>
        <ul className="priority-list">
          {dashboard.aiDispatcher.map((item, index) => (
            <li className="priority-row" key={item.title}>
              <span className="priority-number">{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">{item.detail}</p>
              </div>
              <span className={`pill ${item.priority === "high" ? "high" : item.priority === "normal" ? "medium" : ""}`}>{item.priority}</span>
              <Link className="mini-button" href={item.action}>Open</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2><Users size={18} /> Role-Based Experiences</h2>
        <div className="grid">
          {dashboard.roleViews.map((view) => (
            <article className="panel span-4" key={view.role}>
              <h3>{view.role}</h3>
              <p className="muted">{view.sees.join(", ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="schedule" className="grid section-actions">
        <form action={createWorkerAction} className="panel form-stack span-6">
          <h2>Add worker or subcontractor</h2>
          <input name="name" placeholder="Mike Johnson" required />
          <div className="two-col">
            <select name="roleType" defaultValue="employee">
              <option value="owner">Owner</option>
              <option value="office_manager">Office manager</option>
              <option value="crew_leader">Crew leader</option>
              <option value="employee">Employee</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="manager">Manager</option>
              <option value="other">Other</option>
            </select>
            <select name="payrollType" defaultValue="hourly">
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
              <option value="piece_rate">Piece rate</option>
              <option value="per_job">Per job</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </div>
          <input name="trade" placeholder="Roofing, painting, siding, office" />
          <div className="two-col">
            <input name="phone" placeholder="Phone" />
            <input name="email" type="email" placeholder="Email" />
          </div>
          <input name="hourlyRate" inputMode="decimal" placeholder="Hourly rate, e.g. 28" />
          <button className="button" type="submit">Add worker</button>
        </form>

        <form action={createAssignmentAction} className="panel form-stack span-6">
          <h2>Create dispatch assignment</h2>
          <input name="title" placeholder="Johnson Residence fascia repair" required />
          <select name="workerId" defaultValue="">
            <option value="">Unassigned worker</option>
            {dashboard.workers.map((worker) => (
              <option key={worker.id} value={worker.id}>{worker.name} / {worker.trade}</option>
            ))}
          </select>
          <input name="jobsite" placeholder="Jobsite or address" />
          <div className="two-col">
            <label>Start<input name="scheduledStart" type="datetime-local" /></label>
            <label>End<input name="scheduledEnd" type="datetime-local" /></label>
          </div>
          <select name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <textarea name="taskList" rows={4} placeholder={"One task per line\nPaint north fascia\nReplace window wrap\nTake completion photos"} />
          <button className="button" type="submit">Create assignment</button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Schedule Board</h2>
            <p className="muted">Daily, weekly, crew, and job views are represented now. Drag-and-drop can sit on this same assignment model later without a second scheduler.</p>
          </div>
          <span className="pill medium">dispatch ready</span>
        </div>
        <div className="grid">
          {["Today", "This week", "By crew", "By job"].map((label) => (
            <article className="panel span-3" key={label}>
              <h3>{label}</h3>
              <p className="muted">{dashboard.assignments.length} assignment(s) visible from the same dispatch records.</p>
            </article>
          ))}
        </div>
      </section>

      <section id="time-clock" className="grid section-actions">
        <form action={createClockInAction} className="panel form-stack span-4">
          <h2><Clock size={18} /> Worker App: Clock In</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="clockInLocation" placeholder="Clock-in location" />
          <textarea name="notes" rows={2} placeholder="Starting notes" />
          <label className="checkbox-row"><input name="gpsVerified" type="checkbox" /><span>GPS verified</span></label>
          <button className="mini-button" type="submit">Clock in</button>
        </form>

        <form id="field-work" action={createExpenseAction} className="panel form-stack span-4">
          <h2><ReceiptText size={18} /> Field Cost</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vendor" placeholder="Vendor" />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder="Amount" />
            <input name="tax" inputMode="decimal" placeholder="Tax" />
          </div>
          <input name="category" placeholder="Materials, fuel, tools" />
          <select name="assignTo" defaultValue="job">
            <option value="job">Job</option>
            <option value="customer">Customer</option>
            <option value="department">Department</option>
            <option value="overhead">Overhead</option>
          </select>
          <div className="two-col">
            <select name="reimbursementStatus" defaultValue="submitted">
              <option value="submitted">Needs paid back</option>
              <option value="approved">Approved to pay</option>
              <option value="paid">Already paid back</option>
              <option value="not_reimbursable">Company card / no payback</option>
              <option value="rejected">Rejected</option>
            </select>
            <label>Pay back by<input name="reimbursementDueDate" type="date" /></label>
          </div>
          <textarea name="aiSummary" rows={2} placeholder="Cost summary, vendor details, or notes." />
          <button className="mini-button" type="submit">Add expense</button>
        </form>

        <form action={createMileageAction} className="panel form-stack span-4">
          <h2><Route size={18} /> Mileage Ledger</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vehicleLabel" placeholder="Truck 1, van, trailer" />
          <input name="startLocation" placeholder="Start location" />
          <input name="endLocation" placeholder="End location" />
          <input name="miles" inputMode="decimal" placeholder="Miles" />
          <select name="entryMethod" defaultValue="manual">
            <option value="manual">Manual</option>
            <option value="gps">GPS</option>
            <option value="vehicle_integration">Vehicle integration</option>
          </select>
          <button className="mini-button" type="submit">Add mileage</button>
        </form>
      </section>

      <section className="grid section-actions">
        <form action={createMaterialLogAction} className="panel form-stack span-5">
          <h2><BriefcaseBusiness size={18} /> Materials</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="materialName" placeholder="White fascia, shingles, siding" required />
          <div className="two-col">
            <input name="quantity" inputMode="decimal" placeholder="Quantity" />
            <input name="unit" placeholder="LF, sheet, bundle" />
          </div>
          <select name="logType" defaultValue="used">
            <option value="purchased">Purchased</option>
            <option value="used">Used</option>
            <option value="returned">Returned</option>
            <option value="waste">Waste</option>
            <option value="requested">Requested</option>
          </select>
          <input name="cost" inputMode="decimal" placeholder="Cost" />
          <button className="mini-button" type="submit">Log material</button>
        </form>

        <section className="panel span-7">
          <h2><DollarSign size={18} /> Job Costing Snapshot</h2>
          <p className="muted">Ferocity currently tracks labor time, expenses, mileage, and materials. Profit margin can become exact once estimates/invoices/jobs are linked.</p>
          <div className="grid">
            <Metric label="Payroll hours" value={dashboard.metrics.payrollHours} />
            <Metric label="Expenses" value={dashboard.metrics.expenses} />
            <Metric label="Mileage" value={dashboard.metrics.mileage} />
            <Metric label="Tracked cost" value={dashboard.metrics.jobCost} />
          </div>
        </section>
      </section>

      <section id="recurring-expenses" className="grid section-actions">
        <form action={createRecurringExpenseAction} className="panel form-stack span-5">
          <h2><ReceiptText size={18} /> Recurring Expense Rule</h2>
          <p className="muted">Track rent, software, insurance, subscriptions, vehicle payments, and regular overhead. Ferocity records the rule first; posting an expense still stays review-first.</p>
          <input name="vendor" placeholder="Vendor, e.g. Insurance Co" required />
          <input name="description" placeholder="Description, e.g. Monthly liability insurance" />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder="Amount" />
            <input name="tax" inputMode="decimal" placeholder="Tax" />
          </div>
          <div className="two-col">
            <input name="category" placeholder="Insurance, rent, software" />
            <select name="assignTo" defaultValue="overhead">
              <option value="overhead">Overhead</option>
              <option value="department">Department</option>
              <option value="job">Job</option>
              <option value="customer">Customer</option>
            </select>
          </div>
          <div className="two-col">
            <select name="cadence" defaultValue="monthly">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
            <label>Next due<input name="nextDueDate" type="date" /></label>
          </div>
          <select name="autopostMode" defaultValue="review_first">
            <option value="review_first">Review before posting</option>
            <option value="auto_create_draft">Auto-create draft expense later</option>
            <option value="paused">Paused</option>
          </select>
          <button className="mini-button" type="submit">Add recurring rule</button>
        </form>

        <section className="panel span-7">
          <div className="list-row flush-row">
            <div>
              <h2>Recurring Expenses</h2>
              <p className="muted">Repeating bills and overhead Ferocity should remember. These feed owner visibility before they become accounting entries.</p>
            </div>
            <span className="pill medium">{dashboard.metrics.recurringDue} due soon</span>
          </div>
          <ul className="list">
            {dashboard.recurringExpenses.map((expense) => (
              <li className="list-row" key={expense.id}>
                <div>
                  <h3>{expense.vendor} / {expense.amount}</h3>
                  <p className="muted">{expense.category} / {expense.cadence} / next {expense.nextDueDate} / {expense.mode.replaceAll("_", " ")}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${expense.status === "paused" ? "medium" : ""}`}>{expense.status}</span>
                  <form action={updateRecurringExpenseStatusAction}>
                    <input name="id" type="hidden" value={expense.id} />
                    <input name="status" type="hidden" value={expense.status === "paused" ? "active" : "paused"} />
                    <button className="mini-button secondary-button" type="submit">{expense.status === "paused" ? "Resume" : "Pause"}</button>
                  </form>
                  <form action={updateRecurringExpenseStatusAction}>
                    <input name="id" type="hidden" value={expense.id} />
                    <input name="status" type="hidden" value="archived" />
                    <button className="mini-button secondary-button" type="submit">Archive</button>
                  </form>
                </div>
              </li>
            ))}
            {dashboard.recurringExpenses.length === 0 ? <li className="list-row"><span className="muted">No recurring expense rules yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <form action={createLocationPingAction} className="panel form-stack span-4">
          <h2><MapPin size={18} /> Location Ping</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="locationLabel" placeholder="Jobsite, shop, supplier" />
          <div className="two-col">
            <input name="latitude" inputMode="decimal" placeholder="Latitude" />
            <input name="longitude" inputMode="decimal" placeholder="Longitude" />
          </div>
          <input name="accuracyMeters" inputMode="decimal" placeholder="Accuracy meters" />
          <div className="two-col">
            <select name="pingSource" defaultValue="manual">
              <option value="manual">Manual</option>
              <option value="gps">GPS</option>
              <option value="qr">QR</option>
              <option value="vehicle_integration">Vehicle</option>
            </select>
            <select name="alertStatus" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="late">Late</option>
              <option value="off_route">Off route</option>
              <option value="missing_ping">Missing ping</option>
              <option value="needs_review">Needs review</option>
            </select>
          </div>
          <button className="mini-button" type="submit">Log location</button>
        </form>

        <form action={createFieldMediaAction} className="panel form-stack span-4">
          <h2><ReceiptText size={18} /> Field Proof</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <select name="mediaType" defaultValue="photo">
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="receipt">Cost proof</option>
            <option value="ai_walkthrough">AI Walkthrough</option>
          </select>
          <input name="title" placeholder="Before photo, roof video, cost proof" required />
          <input name="fileUrl" type="url" placeholder="File or shared media URL" />
          <textarea name="aiSummary" rows={2} placeholder="AI summary or proof notes" />
          <select name="consentStatus" defaultValue="internal_only">
            <option value="internal_only">Internal only</option>
            <option value="permission_requested">Permission requested</option>
            <option value="approved_for_customer">Customer approved</option>
            <option value="approved_for_marketing">Marketing approved</option>
          </select>
          <button className="mini-button" type="submit">Save proof</button>
        </form>

        <form id="customer-updates" action={createCustomerUpdateDraftAction} className="panel form-stack span-4">
          <h2>Customer Update Draft</h2>
          <AssignmentSelect assignments={dashboard.assignments} />
          <div className="two-col">
            <select name="channel" defaultValue="portal">
              <option value="portal">Portal</option>
              <option value="email">Email</option>
              <option value="sms">Text message</option>
              <option value="phone_note">Phone note</option>
            </select>
            <input name="recipientContact" placeholder="Phone or email" />
          </div>
          <input name="subject" placeholder="Subject" />
          <textarea name="body" rows={5} placeholder="We are on the way, running late, job completed, or photos are ready." required />
          <button className="mini-button" type="submit">Draft update</button>
        </form>
      </section>

      <section id="payroll" className="grid section-actions">
        <form action={createPayrollExportAction} className="panel form-stack span-5">
          <h2><DollarSign size={18} /> Payroll Export Draft</h2>
          <p className="muted">Creates a batch for review. Ferocity does not run payroll or send to a provider until the connection and export are approved.</p>
          <select name="provider" defaultValue="csv">
            <option value="csv">CSV</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="gusto">Gusto</option>
            <option value="adp">ADP</option>
            <option value="manual">Manual</option>
          </select>
          <div className="two-col">
            <label>Start<input name="periodStart" type="date" /></label>
            <label>End<input name="periodEnd" type="date" /></label>
          </div>
          <textarea name="notes" rows={3} placeholder="Owner review notes" />
          <button className="mini-button" type="submit">Prepare payroll</button>
        </form>

        <section className="panel span-7">
          <h2>Provider Readiness</h2>
          <p className="muted">Payroll, accounting, calendar, GPS, customer communication, and storage stay modular. Connectors can be paused or replaced without rebuilding the operations system.</p>
          <div className="grid">
            {["QuickBooks", "Gusto", "ADP", "Google Calendar", "Customer updates", "Resend", "GPS"].map((provider) => (
              <article className="panel span-3" key={provider}>
                <h3>{provider}</h3>
                <p className="muted">Not connected</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <div className="grid section-actions">
        <ListPanel title="Workers" icon={<Users size={18} />} rows={dashboard.workers.map((worker) => ({
          id: worker.id,
          title: worker.name,
          meta: `${worker.roleType} / ${worker.trade} / ${worker.hourlyRate}`,
          pill: worker.status
        }))} />
        <ListPanel title="Schedule / Dispatch" icon={<MapPin size={18} />} rows={dashboard.assignments.map((assignment) => ({
          id: assignment.id,
          title: assignment.title,
          meta: `${assignment.worker} / ${assignment.jobsite} / ${assignment.schedule} / ${assignment.tasks} task(s). ${assignment.aiNotes}`,
          pill: assignment.status
        }))} />
        <section className="panel span-6">
          <h2><Clock size={18} /> Time Entries</h2>
          <ul className="list">
            {dashboard.timeEntries.map((entry) => (
              <li className="list-row" key={entry.id}>
                <div>
                  <h3>{entry.worker} / {entry.hours} hours</h3>
                  <p className="muted">{entry.assignment} / {entry.clockIn} / {entry.clockOut} / {entry.verified}</p>
                  {entry.status === "open" ? (
                    <form action={clockOutTimeEntryAction} className="inline-form">
                      <input name="timeEntryId" type="hidden" value={entry.id} />
                      <input name="clockOutLocation" placeholder="End location" />
                      <input name="breakMinutes" inputMode="numeric" placeholder="Break min" />
                      <input name="notes" placeholder="Closeout notes" />
                      <button className="mini-button" type="submit">Clock out</button>
                    </form>
                  ) : null}
                </div>
                <span className="pill">{entry.status}</span>
              </li>
            ))}
            {dashboard.timeEntries.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
          </ul>
        </section>
        <ListPanel title="Expenses" icon={<ReceiptText size={18} />} rows={dashboard.expenses.map((expense) => ({
          id: expense.id,
          title: `${expense.vendor} / ${expense.amount}`,
          meta: `${expense.worker} / ${expense.category} / ${expense.summary}`,
          pill: expense.status
        }))} />
        <ListPanel title="Mileage" icon={<Route size={18} />} rows={dashboard.mileage.map((entry) => ({
          id: entry.id,
          title: `${entry.worker} / ${entry.miles} miles`,
          meta: `${entry.route} / ${entry.vehicle}`,
          pill: entry.status
        }))} />
        <ListPanel title="Material Logs" icon={<BriefcaseBusiness size={18} />} rows={dashboard.materials.map((material) => ({
          id: material.id,
          title: `${material.material} / ${material.quantity}`,
          meta: `${material.logType} / ${material.cost}`,
          pill: material.status
        }))} />
        <ListPanel title="Location Pings" icon={<MapPin size={18} />} rows={dashboard.locationPings.map((ping) => ({
          id: ping.id,
          title: `${ping.worker} / ${ping.location}`,
          meta: `${ping.assignment} / ${ping.source}`,
          pill: ping.status
        }))} />
        <ListPanel title="Field Proof" icon={<ReceiptText size={18} />} rows={dashboard.fieldMedia.map((media) => ({
          id: media.id,
          title: `${media.title} / ${media.type}`,
          meta: `${media.worker} / ${media.summary} / ${media.consent}`,
          pill: media.status
        }))} />
        <section className="panel span-6">
          <h2><DollarSign size={18} /> Payroll Exports</h2>
          <ul className="list">
            {dashboard.payrollExports.map((batch) => (
              <li className="list-row" key={batch.id}>
                <div>
                  <h3>{batch.provider} / {batch.period}</h3>
                  <p className="muted">{batch.hours} hours / {batch.notes}</p>
                  <div className="inline-actions">
                    <form action={markPayrollExportReadyAction}>
                      <input name="id" type="hidden" value={batch.id} />
                      <button className="mini-button" type="submit">Mark ready</button>
                    </form>
                    <form action={markPayrollExportedAction}>
                      <input name="id" type="hidden" value={batch.id} />
                      <button className="mini-button" type="submit">Mark exported</button>
                    </form>
                  </div>
                </div>
                <span className="pill">{batch.status}</span>
              </li>
            ))}
            {dashboard.payrollExports.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-6">
          <h2><Users size={18} /> Customer Update Drafts</h2>
          <ul className="list">
            {dashboard.customerDrafts.map((draft) => (
              <li className="list-row" key={draft.id}>
                <div>
                  <h3>{draft.channel} / {draft.subject}</h3>
                  <p className="muted">{draft.recipient} / {draft.body}</p>
                  <div className="inline-actions">
                    <form action={approveCustomerUpdateDraftAction}>
                      <input name="id" type="hidden" value={draft.id} />
                      <button className="mini-button" type="submit">Approve</button>
                    </form>
                    <form action={sendCustomerUpdateDraftAction}>
                      <input name="id" type="hidden" value={draft.id} />
                      <button className="mini-button" type="submit">Send if ready</button>
                    </form>
                  </div>
                </div>
                <span className="pill">{draft.status}</span>
              </li>
            ))}
            {dashboard.customerDrafts.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
          </ul>
        </section>
        <ListPanel title="Cost Extractions" icon={<ReceiptText size={18} />} rows={dashboard.receiptExtractions.map((receipt) => ({
          id: receipt.id,
          title: `${receipt.vendor} / ${receipt.total}`,
          meta: `confidence ${receipt.confidence}`,
          pill: receipt.status
        }))} />
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}

function WorkerSelect({ workers }: { workers: { id: string; name: string; trade: string }[] }) {
  return (
    <select name="workerId" defaultValue="">
      <option value="">Select worker</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>{worker.name} / {worker.trade}</option>
      ))}
    </select>
  );
}

function AssignmentSelect({ assignments }: { assignments: { id: string; title: string }[] }) {
  return (
    <select name="assignmentId" defaultValue="">
      <option value="">No assignment</option>
      {assignments.map((assignment) => (
        <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
      ))}
    </select>
  );
}

function ListPanel({ title, icon, rows }: { title: string; icon: ReactNode; rows: { id: string; title: string; meta: string; pill: string }[] }) {
  return (
    <section className="panel span-6">
      <h2>{icon} {title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              <p className="muted">{row.meta}</p>
            </div>
            <span className="pill">{row.pill}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
      </ul>
    </section>
  );
}
