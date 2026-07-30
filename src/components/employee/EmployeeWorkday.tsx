import Link from "next/link";
import { Camera, Clock, MapPin, ReceiptText, Route } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { OfflineFieldBridge } from "@/components/employee/OfflineFieldBridge";
import { getEmployeeWorkday } from "@/lib/employee/get-employee-workday";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import {
  clockOutTimeEntryAction,
  createClockInAction,
  createExpenseAction,
  createFieldMediaAction,
  createMileageAction
} from "@/app/app/operations-workforce/actions";

export async function EmployeeWorkday({ showOwnerLinks = false }: { showOwnerLinks?: boolean }) {
  const employeeDashboard = showOwnerLinks ? null : await getEmployeeWorkday();
  const dashboard = employeeDashboard ?? await getOperationsWorkforceDashboard();
  const openAssignments = dashboard.assignments.filter((assignment) => assignment.status !== "completed").slice(0, 8);
  const employeeMode = !showOwnerLinks;
  const signedInWorker = employeeDashboard?.workers[0] ?? null;

  return (
    <QueuePageShell
      eyebrow="Employee App"
      title="Today's Work"
      description="A simple field view for the basics: see the day's work, punch in, log miles, add a field cost, and upload proof."
    >
      <OfflineFieldBridge />

      {employeeMode && !signedInWorker ? (
        <section className="notice warning">
          <strong>Your employee profile needs to be linked.</strong>
          <p>
            Ask a workspace owner to use the same email address on your employee record and login. Ferocity will then connect your assigned work
            automatically.
          </p>
        </section>
      ) : null}

      <section className="grid section-actions">
        <Metric label="Working now" value={dashboard.metrics.workingNow} />
        <Metric label="Scheduled today" value={dashboard.metrics.scheduledToday} />
        <Metric label="Open assignments" value={dashboard.metrics.openAssignments} />
        <Metric label="Needs review" value={dashboard.metrics.needsReview} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Work List</h2>
            <p className="muted">Your assigned work, schedule, and field actions are together in one place.</p>
          </div>
          <div className="button-row">
            {showOwnerLinks ? <Link className="mini-button" href="/app/crew-itinerary">Crew Day</Link> : null}
            {showOwnerLinks ? <Link className="mini-button secondary-button" href="/app/operations-workforce">Full workforce view</Link> : null}
          </div>
        </div>
        <ul className="list">
          {openAssignments.map((assignment) => (
            <li className="list-row" key={assignment.id}>
              <div>
                <h3>
                  {assignment.serviceVisitId ? (
                    <Link href={`/employee/visits/${assignment.serviceVisitId}`}>{assignment.title}</Link>
                  ) : assignment.title}
                </h3>
                <p className="muted">{assignment.worker} / {assignment.jobsite}</p>
                <p>{assignment.schedule}</p>
              </div>
              <div className="button-row">
                <span className={`pill ${assignment.priority === "high" || assignment.priority === "urgent" ? "high" : ""}`}>{assignment.status}</span>
                {assignment.serviceVisitId ? <Link className="mini-button" href={`/employee/visits/${assignment.serviceVisitId}`}>Open work</Link> : null}
              </div>
            </li>
          ))}
          {openAssignments.length === 0 ? <li className="list-row"><span className="muted">No work is assigned yet.</span></li> : null}
        </ul>
      </section>

      <section id="quick-actions" className="grid section-actions">
        <form action={createClockInAction} className="panel form-stack span-6">
          <h2><Clock size={18} /> Punch In</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="clockInLocation" placeholder="Where are you starting?" />
          <textarea name="notes" rows={2} placeholder="Anything the office should know?" />
          <label className="checkbox-row"><input name="gpsVerified" type="checkbox" /><span>Location checked</span></label>
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>Punch in</button>
        </form>

        {employeeDashboard?.openTimeEntry ? (
          <form action={clockOutTimeEntryAction} className="panel form-stack span-6">
            <h2><Clock size={18} /> Punch Out</h2>
            <input name="employeeMode" type="hidden" value="1" />
            <input name="timeEntryId" type="hidden" value={employeeDashboard.openTimeEntry.id} />
            <p>You punched in {employeeDashboard.openTimeEntry.clockIn}.</p>
            <input name="clockOutLocation" placeholder="Where are you finishing?" />
            <input name="breakMinutes" inputMode="numeric" placeholder="Unpaid break minutes" />
            <textarea name="notes" rows={2} placeholder="End-of-day note for the office" />
            <button className="button" type="submit">Punch out</button>
          </form>
        ) : null}

        <form action={createMileageAction} className="panel form-stack span-6">
          <h2><Route size={18} /> Log Miles</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vehicleLabel" placeholder="Truck, van, or trailer" />
          <input name="startLocation" placeholder="Start" />
          <input name="endLocation" placeholder="End" />
          <input name="miles" inputMode="decimal" placeholder="Miles" />
          <input name="entryMethod" type="hidden" value="manual" />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>Save miles</button>
        </form>

        <form action={createExpenseAction} className="panel form-stack span-6">
          <h2><ReceiptText size={18} /> Add Field Cost</h2>
          <p className="muted">Snap the receipt now so the office can approve job cost, payback, tax category, and P&L totals without chasing paperwork.</p>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vendor" placeholder="Store or vendor" />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder="Amount" />
            <input name="tax" inputMode="decimal" placeholder="Tax" />
          </div>
          <input name="category" placeholder="Materials, fuel, tools" />
          <label>
            Receipt photo
            <input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" />
            <span className="field-help">On a phone, this can open the camera. The office reviews it before approval.</span>
          </label>
          <input name="receiptUrl" type="url" placeholder="Optional receipt or proof link" />
          <label className="check-row">
            <input name="extractReceipt" type="checkbox" />
            Draft cost details from the receipt
          </label>
          <input name="assignTo" type="hidden" value="job" />
          <select name="reimbursementStatus" defaultValue="submitted">
            <option value="submitted">Needs paid back</option>
            <option value="not_reimbursable">Company card / no payback</option>
          </select>
          <textarea name="aiSummary" rows={2} placeholder="Short note for the office" />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>Save cost</button>
        </form>

        <form action={createFieldMediaAction} className="panel form-stack span-6">
          <h2><Camera size={18} /> Upload Proof</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <select name="mediaType" defaultValue="photo">
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="receipt">Cost proof</option>
          </select>
          <input name="title" placeholder="Before photo, completed work, delivery proof" required />
          <label>
            Photo, video, or document
            <input name="mediaFile" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" capture="environment" />
            <span className="field-help">On a phone, this can open the camera. Files are stored privately and sent to the office for review.</span>
          </label>
          {showOwnerLinks ? <input name="fileUrl" type="url" placeholder="Optional existing proof link" /> : null}
          <textarea name="aiSummary" rows={2} placeholder="What does this show?" />
          <input name="consentStatus" type="hidden" value="internal_only" />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>Save proof</button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><MapPin size={18} /> Field Notes</h2>
            <p className="muted">Keep the office current with job notes, receipts, mileage, and proof while you work.</p>
          </div>
          {showOwnerLinks ? <Link className="mini-button" href="/app/notifications">Reminders</Link> : null}
        </div>
      </section>
    </QueuePageShell>
  );
}

function EmployeeModeFields({
  employeeMode,
  worker
}: {
  employeeMode: boolean;
  worker: { id: string; name: string; trade: string } | null;
}) {
  if (!employeeMode) return null;
  return (
    <>
      <input name="employeeMode" type="hidden" value="1" />
      <input name="workerId" type="hidden" value={worker?.id ?? ""} />
      <p className="muted">{worker ? `${worker.name} / ${worker.trade}` : "Employee profile not linked"}</p>
    </>
  );
}

function WorkerSelect({ workers }: { workers: { id: string; name: string; trade: string }[] }) {
  return (
    <select name="workerId" defaultValue="">
      <option value="">Who is doing this?</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>{worker.name} / {worker.trade}</option>
      ))}
    </select>
  );
}

function AssignmentSelect({ assignments }: { assignments: { id: string; title: string; jobsite: string }[] }) {
  return (
    <select name="assignmentId" defaultValue="">
      <option value="">Which job?</option>
      {assignments.map((assignment) => (
        <option key={assignment.id} value={assignment.id}>{assignment.title} / {assignment.jobsite}</option>
      ))}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel metric span-3">
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </section>
  );
}
