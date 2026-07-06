import Link from "next/link";
import { Camera, Clock, MapPin, ReceiptText, Route } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import {
  createClockInAction,
  createExpenseAction,
  createFieldMediaAction,
  createMileageAction
} from "../operations-workforce/actions";

export default async function EmployeeViewPage() {
  const dashboard = await getOperationsWorkforceDashboard();
  const openAssignments = dashboard.assignments.filter((assignment) => assignment.status !== "completed").slice(0, 8);

  return (
    <QueuePageShell
      eyebrow="Employee View"
      title="Today's Work"
      description="A simple field view for the basics: see the day's work, punch in, log miles, add a field cost, and upload proof."
    >
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
            <p className="muted">Employees can use this page without opening the full owner command center.</p>
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/app/crew-itinerary">Crew Day</Link>
            <Link className="mini-button secondary-button" href="/app/operations-workforce">Full workforce view</Link>
          </div>
        </div>
        <ul className="list">
          {openAssignments.map((assignment) => (
            <li className="list-row" key={assignment.id}>
              <div>
                <h3>{assignment.title}</h3>
                <p className="muted">{assignment.worker} / {assignment.jobsite}</p>
                <p>{assignment.schedule}</p>
              </div>
              <span className={`pill ${assignment.priority === "high" || assignment.priority === "urgent" ? "high" : ""}`}>{assignment.status}</span>
            </li>
          ))}
          {openAssignments.length === 0 ? <li className="list-row"><span className="muted">No work is assigned yet.</span></li> : null}
        </ul>
      </section>

      <section id="quick-actions" className="grid section-actions">
        <form action={createClockInAction} className="panel form-stack span-6">
          <h2><Clock size={18} /> Punch In</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="clockInLocation" placeholder="Where are you starting?" />
          <textarea name="notes" rows={2} placeholder="Anything the office should know?" />
          <label className="checkbox-row"><input name="gpsVerified" type="checkbox" /><span>Location checked</span></label>
          <button className="button" type="submit">Punch in</button>
        </form>

        <form action={createMileageAction} className="panel form-stack span-6">
          <h2><Route size={18} /> Log Miles</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vehicleLabel" placeholder="Truck, van, or trailer" />
          <input name="startLocation" placeholder="Start" />
          <input name="endLocation" placeholder="End" />
          <input name="miles" inputMode="decimal" placeholder="Miles" />
          <input name="entryMethod" type="hidden" value="manual" />
          <button className="button" type="submit">Save miles</button>
        </form>

        <form action={createExpenseAction} className="panel form-stack span-6">
          <h2><ReceiptText size={18} /> Add Field Cost</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vendor" placeholder="Store or vendor" />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder="Amount" />
            <input name="tax" inputMode="decimal" placeholder="Tax" />
          </div>
          <input name="category" placeholder="Materials, fuel, tools" />
          <input name="assignTo" type="hidden" value="job" />
          <select name="reimbursementStatus" defaultValue="submitted">
            <option value="submitted">Needs paid back</option>
            <option value="not_reimbursable">Company card / no payback</option>
          </select>
          <textarea name="aiSummary" rows={2} placeholder="Short note for the office" />
          <button className="button" type="submit">Save cost</button>
        </form>

        <form action={createFieldMediaAction} className="panel form-stack span-6">
          <h2><Camera size={18} /> Upload Proof</h2>
          <WorkerSelect workers={dashboard.workers} />
          <AssignmentSelect assignments={dashboard.assignments} />
          <select name="mediaType" defaultValue="photo">
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="receipt">Cost proof</option>
          </select>
          <input name="title" placeholder="Before photo, completed work, delivery proof" required />
          <input name="fileUrl" type="url" placeholder="Photo/video link for now" />
          <textarea name="aiSummary" rows={2} placeholder="What does this show?" />
          <input name="consentStatus" type="hidden" value="internal_only" />
          <button className="button" type="submit">Save proof</button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><MapPin size={18} /> Field Notes</h2>
            <p className="muted">This is intentionally smaller than the owner view. It is for daily work, not setup, billing, marketing, or reports.</p>
          </div>
          <Link className="mini-button" href="/app/notifications">Reminders</Link>
        </div>
      </section>
    </QueuePageShell>
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
    <section className="metric-card span-3">
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </section>
  );
}
