import Link from "next/link";
import { CalendarClock, MessageSquareText, MoveRight, RefreshCw, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperatorConsoleDashboard } from "@/lib/operator/get-operator-console";
import {
  moveOpportunityStageAction,
  scanLeadToJobLoopAction,
  updateCommunicationThreadAction,
  updateScheduleEventAction
} from "./actions";

function dateLabel(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function OperatorConsolePage() {
  const dashboard = await getOperatorConsoleDashboard();
  const stageOptions = dashboard.stages.map((stage) => ({ id: stage.id, name: stage.name }));

  return (
    <QueuePageShell
      eyebrow="Operator Console"
      title="Lead-To-Job Operating Loop"
      description="A focused vertical for conversations, pipeline movement, callbacks, appointments, and revenue readiness. Provider sends stay disabled until integrations are connected."
    >
      <div className="button-row section-actions">
        <form action={scanLeadToJobLoopAction}>
          <button className="button" type="submit">
            <RefreshCw size={16} /> Scan lead-to-job loop
          </button>
        </form>
        <Link className="button secondary-button" href="/app/leads">
          Leads
        </Link>
        <Link className="button secondary-button" href="/app/service">
          Service Ops
        </Link>
        <Link className="button secondary-button" href="/app/growth">
          Growth Loop
        </Link>
      </div>

      <div className="grid section-actions">
        {dashboard.metrics.map((metric) => (
          <section className="panel span-2 metric" key={metric.label}>
            <span className="muted">{metric.label}</span>
            <strong>{metric.label === "Pipeline value" ? `$${metric.value.toLocaleString()}` : metric.value.toLocaleString()}</strong>
            <small className="muted">{metric.detail}</small>
          </section>
        ))}
      </div>

      <div className="grid">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Unified Conversations</h2>
              <p className="muted">Two-way SMS/email-ready architecture with internal notes and customer-visible draft messages.</p>
            </div>
            <MessageSquareText size={20} />
          </div>
          <ul className="list">
            {dashboard.threads.map((thread) => (
              <li className="list-row" key={thread.id}>
                <form action={updateCommunicationThreadAction} className="form-stack compact-form">
                  <input name="threadId" type="hidden" value={thread.id} />
                  <div className="list-row flush-row">
                    <div>
                      <h3>{thread.subject}</h3>
                      <p className="muted">
                        {[thread.brandName, thread.leadName, thread.customerName, thread.channel].filter(Boolean).join(" / ")}
                      </p>
                      <p className="muted">Next follow-up: {dateLabel(thread.nextFollowUpAt)} / unanswered: {dateLabel(thread.unansweredSince)}</p>
                    </div>
                    <span className="pill">{thread.status}</span>
                  </div>
                  <div className="two-col">
                    <select name="status" defaultValue={thread.status}>
                      <option value="open">open</option>
                      <option value="waiting_on_customer">waiting_on_customer</option>
                      <option value="waiting_on_team">waiting_on_team</option>
                      <option value="closed">closed</option>
                      <option value="archived">archived</option>
                    </select>
                    <button className="mini-button" type="submit">
                      Save thread
                    </button>
                  </div>
                  <textarea name="note" rows={2} placeholder="Internal note, not sent to customer" />
                </form>
              </li>
            ))}
            {dashboard.threads.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No conversation threads yet</h3>
                  <p className="muted">Run the scan to create threads from real open leads.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Scheduling Foundation</h2>
              <p className="muted">Callbacks, appointments, scheduled jobs, reminder policies, and Google Calendar readiness.</p>
            </div>
            <CalendarClock size={20} />
          </div>
          <ul className="list">
            {dashboard.schedule.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">
                    {[event.brandName, event.eventType, dateLabel(event.startsAt), event.location].filter(Boolean).join(" / ")}
                  </p>
                </div>
                <form action={updateScheduleEventAction} className="inline-actions">
                  <input name="eventId" type="hidden" value={event.id} />
                  <select name="status" defaultValue={event.status}>
                    <option value="scheduled">scheduled</option>
                    <option value="completed">completed</option>
                    <option value="missed">missed</option>
                    <option value="canceled">canceled</option>
                  </select>
                  <button className="mini-button" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
            {dashboard.schedule.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No schedule events yet</h3>
                  <p className="muted">Callbacks and scheduled service jobs appear here after the scan.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Opportunity Pipeline</h2>
              <p className="muted">Stage-based sales flow, won/lost readiness, follow-up reminders, callbacks, and forecastable value.</p>
            </div>
            <Workflow size={20} />
          </div>
          <div className="grid">
            {dashboard.stages.map((stage) => (
              <section className="span-4" key={stage.id}>
                <div className="list-row flush-row">
                  <div>
                    <h3>{stage.name}</h3>
                    <p className="muted">{stage.probability}% default probability</p>
                  </div>
                  <span className="pill">{stage.opportunities.length}</span>
                </div>
                <ul className="list">
                  {stage.opportunities.map((opportunity) => (
                    <li className="list-row" key={opportunity.id}>
                      <form action={moveOpportunityStageAction} className="form-stack compact-form">
                        <input name="opportunityId" type="hidden" value={opportunity.id} />
                        <div>
                          <h4>{opportunity.title}</h4>
                          <p className="muted">
                            {[opportunity.brandName, opportunity.leadName, opportunity.customerName].filter(Boolean).join(" / ")}
                          </p>
                          <p className="muted">
                            {money(opportunity.valueCents)} / {opportunity.closeProbability}% / follow-up {dateLabel(opportunity.nextFollowUpAt)}
                          </p>
                        </div>
                        <div className="two-col">
                          <select name="stageId" defaultValue={stage.id}>
                            {stageOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                          <button className="mini-button" type="submit">
                            <MoveRight size={14} /> Move
                          </button>
                        </div>
                        <input name="notes" placeholder="Stage note" />
                      </form>
                    </li>
                  ))}
                  {stage.opportunities.length === 0 ? (
                    <li className="list-row">
                      <span className="muted">No opportunities in this stage.</span>
                    </li>
                  ) : null}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className="panel span-6">
          <h2>Message Templates</h2>
          <p className="muted">Provider-ready templates for SMS/email/manual workflows. Approval stays required.</p>
          <ul className="list">
            {dashboard.templates.map((template) => (
              <li className="list-row" key={template.id}>
                <div>
                  <h3>{template.name}</h3>
                  <p className="muted">
                    {template.purpose} / {template.channel}
                  </p>
                </div>
                <span className="pill">{template.requiresApproval ? "approval required" : "approval optional"}</span>
              </li>
            ))}
            {dashboard.templates.length === 0 ? (
              <li className="list-row">
                <span className="muted">Templates will appear after migration seeds run.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Operator Timeline</h2>
          <p className="muted">Lead, follow-up, estimate, job, revenue, and system events in one history.</p>
          <ul className="list">
            {dashboard.timeline.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">
                    {event.family} / {event.type} / {dateLabel(event.occurredAt)}
                  </p>
                  {event.body ? <p>{event.body}</p> : null}
                </div>
              </li>
            ))}
            {dashboard.timeline.length === 0 ? (
              <li className="list-row">
                <span className="muted">Scan and operator actions will populate this timeline.</span>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}
