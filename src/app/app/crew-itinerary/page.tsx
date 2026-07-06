import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";

export default async function CrewItineraryPage() {
  const dashboard = await getOperationsWorkforceDashboard();
  const openAssignments = dashboard.assignments.filter((assignment) => assignment.status !== "completed");
  const reviewItems = [
    ...dashboard.expenses.filter((expense) => expense.status.includes("review") || expense.status.includes("payback")),
    ...dashboard.materials.filter((material) => material.status.includes("review"))
  ].slice(0, 6);

  return (
    <QueuePageShell
      eyebrow="Crew Day"
      title="Daily Crew Itinerary"
      description="A simple day-plan view for who is working, where they are going, what needs proof, and what the owner should review."
    >
      <div className="grid">
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Today At A Glance</h2>
              <p className="muted">Use this as the simple day-plan view. Detailed scheduling, field costs, mileage, proof, and payroll stay in Workforce.</p>
            </div>
            <div className="button-row">
              <Link className="mini-button" href="/app/operations-workforce#schedule">Schedule work</Link>
              <Link className="mini-button secondary-button" href="/app/operations-workforce#time-clock">Time clock</Link>
            </div>
          </div>
          <div className="snapshot-grid">
            <Snapshot label="Working now" value={dashboard.metrics.workingNow} detail="Open clock-ins" />
            <Snapshot label="Scheduled today" value={dashboard.metrics.scheduledToday} detail="Assignments on the board" />
            <Snapshot label="Needs review" value={dashboard.metrics.needsReview} detail="Costs, mileage, materials" />
            <Snapshot label="Hours this week" value={dashboard.metrics.payrollHours} detail="Payroll visibility" />
          </div>
        </section>

        <section className="panel span-8">
          <h2>Work List</h2>
          <ul className="list">
            {openAssignments.map((assignment) => (
              <li className="list-row" key={assignment.id}>
                <div>
                  <h4>{assignment.title}</h4>
                  <p className="muted">{assignment.worker} / {assignment.crew} / {assignment.jobsite}</p>
                  <p className="muted">{assignment.schedule}</p>
                  <p>{assignment.aiNotes}</p>
                </div>
                <div className="button-row">
                  <span className="pill">{assignment.priority}</span>
                  <span className="pill">{assignment.status}</span>
                </div>
              </li>
            ))}
            {openAssignments.length === 0 ? <li className="list-row"><span className="muted">No open assignments yet. Add work from Workforce or Work Records.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-4">
          <h2>People</h2>
          <ul className="list">
            {dashboard.workers.map((worker) => (
              <li className="list-row" key={worker.id}>
                <div>
                  <h4>{worker.name}</h4>
                  <p className="muted">{worker.roleType} / {worker.trade}</p>
                </div>
                <span className="pill">{worker.status}</span>
              </li>
            ))}
            {dashboard.workers.length === 0 ? <li className="list-row"><span className="muted">No active workers yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Owner Review</h2>
          <ul className="list">
            {reviewItems.map((item) => (
              <li className="list-row" key={`${item.id}-${"amount" in item ? item.amount : item.cost}`}>
                <div>
                  <h4>{"vendor" in item ? item.vendor : item.material}</h4>
                  <p className="muted">{"worker" in item ? item.worker : item.quantity}</p>
                </div>
                <span className="pill">{"amount" in item ? item.amount : item.cost}</span>
              </li>
            ))}
            {reviewItems.length === 0 ? <li className="list-row"><span className="muted">No field cost, material, or mileage review items are waiting.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Send Updates</h2>
          <ul className="list">
            {dashboard.customerDrafts.map((draft) => (
              <li className="list-row" key={draft.id}>
                <div>
                  <h4>{draft.subject}</h4>
                  <p className="muted">{draft.channel} / {draft.recipient}</p>
                  <p>{draft.body}</p>
                </div>
                <span className="pill">{draft.status}</span>
              </li>
            ))}
            {dashboard.customerDrafts.length === 0 ? <li className="list-row"><span className="muted">No customer updates are drafted yet.</span></li> : null}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Snapshot({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="snapshot-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
