import Link from "next/link";
import { AlertTriangle, Clock, PhoneCall, ReceiptText, ShieldAlert, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { cleanCallInboxFilter, getCallInboxDashboard, type CallInboxFilter } from "@/lib/office-manager/get-call-inbox";
import { respondToCallScreeningAction } from "./actions";

const filterLabels: Array<[CallInboxFilter, string]> = [
  ["all", "All"],
  ["new_lead", "New leads"],
  ["existing_customer", "Customers"],
  ["scheduled", "Scheduled"],
  ["missed", "Missed"],
  ["transferred", "Transferred"],
  ["needs_follow_up", "Needs follow-up"],
  ["spam", "Spam"],
  ["failed", "Failed"],
  ["after_hours", "After hours"],
  ["unresolved", "Unresolved"]
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function when(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const filter = cleanCallInboxFilter(params.filter);
  const dashboard = await getCallInboxDashboard(filter);

  return (
    <QueuePageShell
      eyebrow="Receptionist Inbox"
      title="Calls, Context, And Follow-Up"
      description="Ferocity screens each connected call, handles routine requests, and gives you the reason and context before an important caller reaches you."
    >
      <section className="grid section-actions">
        <Metric icon={<PhoneCall size={18} />} label="Calls" value={dashboard.metrics.total} />
        <Metric icon={<Workflow size={18} />} label="Need follow-up" value={dashboard.metrics.needsFollowUp} tone={dashboard.metrics.needsFollowUp ? "medium" : ""} />
        <Metric icon={<AlertTriangle size={18} />} label="Unresolved" value={dashboard.metrics.unresolved} tone={dashboard.metrics.unresolved ? "high" : ""} />
        <Metric icon={<Clock size={18} />} label="Missed" value={dashboard.metrics.missed} tone={dashboard.metrics.missed ? "medium" : ""} />
        <Metric icon={<ShieldAlert size={18} />} label="Spam/failed" value={dashboard.metrics.spam + dashboard.metrics.failed} />
        <Metric icon={<ReceiptText size={18} />} label="Tracked minutes" value={dashboard.metrics.usageMinutes} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Filters</h2>
            <p className="muted">See every call in one place and focus first on the ones that need a person.</p>
          </div>
          <Link className="button secondary-button" href="/app/office-manager">Office Manager</Link>
        </div>
        <div className="button-row">
          {filterLabels.map(([key, text]) => (
            <Link className={`button ${dashboard.filter === key ? "" : "secondary-button"}`} href={`/app/calls?filter=${key}`} key={key}>
              {text}
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Call Records</h2>
            <p className="muted">
              Tracked customer usage: {money(dashboard.metrics.billableCents)}. Charges appear only when the business enables a billable calling service.
            </p>
          </div>
          <Link className="button secondary-button" href="/app/ai-control">Usage controls</Link>
        </div>
        <ul className="list">
          {dashboard.rows.map((call) => (
            <li className="list-row" key={call.id}>
              <div>
                <h3>{call.callerNumber}</h3>
                <p className="muted">
                  Called {call.calledNumber} / {when(call.startedAt)} / {duration(call.durationSeconds)}
                </p>
                <p>{call.summary}</p>
                {call.callerContext ? <p><strong>{call.callerContext}</strong></p> : null}
                {call.decisionReason ? <p className="muted">Why: {call.decisionReason}</p> : null}
                {call.actionItems.length ? (
                  <p className="muted">Action items: {call.actionItems.join("; ")}</p>
                ) : null}
                <div className="button-row">
                  <Link className="button secondary-button" href={`/app/calls/${call.id}`}>Call details</Link>
                  {call.customerId ? <Link className="button secondary-button" href={`/app/service/customers/${call.customerId}`}>Customer</Link> : null}
                  {call.leadId ? <Link className="button secondary-button" href={`/app/leads/${call.leadId}`}>Lead</Link> : null}
                  {call.jobId ? <Link className="button secondary-button" href={`/app/service/jobs/${call.jobId}`}>Job</Link> : null}
                </div>
                {call.callDecision && !call.ownerResponse ? (
                  <form action={respondToCallScreeningAction} className="form-grid section-actions">
                    <input name="callId" type="hidden" value={call.id} />
                    <label>
                      What should happen?
                      <select defaultValue={call.shouldInterruptOwner ? "accept" : "return_to_ai"} name="response">
                        <option value="accept">Accept the call</option>
                        <option value="decline">Decline</option>
                        <option value="voicemail">Send to voicemail</option>
                        <option value="return_to_ai">Let AI continue</option>
                        <option value="transfer_employee">Transfer to an employee</option>
                        <option value="schedule_callback">Schedule a callback</option>
                      </select>
                    </label>
                    <label>
                      Employee or destination (optional)
                      <input name="target" placeholder="Name or extension" />
                    </label>
                    <label>
                      Remember this choice
                      <select defaultValue="one_time" name="remember">
                        <option value="one_time">This call only</option>
                        <option value="customer">For this customer</option>
                        <option value="workflow">For calls like this</option>
                        <option value="user">As my default</option>
                        <option value="organization">For the whole business</option>
                      </select>
                    </label>
                    <button className="button" type="submit">Apply</button>
                  </form>
                ) : null}
              </div>
              <div className="status-card">
                {call.priorityClass ? <span className={`pill ${call.shouldInterruptOwner ? "high" : ""}`}>{label(call.priorityClass)}</span> : null}
                <span>{label(call.status)}</span>
                <strong>{label(call.outcome)}</strong>
                {call.callDecision ? <span>Ferocity: {label(call.callDecision)}</span> : null}
                {call.ownerResponse ? <span>Your choice: {label(call.ownerResponse)}</span> : null}
                <span>{label(call.followUpStatus)} / {label(call.sentiment)}</span>
                <span>{call.transcriptStatus ? `Transcript: ${label(call.transcriptStatus)}` : "No transcript"}</span>
                <span>{call.recordingStatus ? `Recording: ${label(call.recordingStatus)}` : "No recording"}</span>
              </div>
            </li>
          ))}
          {dashboard.rows.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No calls in this view yet</h3>
                <p className="muted">
                  Finish phone setup and a test call to populate real call records. Until then, Ferocity can still prepare the Office Manager, owner commands, app alerts, email queues, and manual follow-up work.
                </p>
              </div>
              <Link className="button" href="/app/office-manager">Set up Office Manager</Link>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${tone}`}>calls</small>
      {icon}
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </section>
  );
}
