import Link from "next/link";
import type React from "react";
import { AlertTriangle, BarChart3, CheckCircle2, CircleDollarSign, ClipboardList, Target } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getRevenueGrowthDashboard, type RevenueBreakdownRow } from "@/lib/revenue-growth/get-revenue-growth-dashboard";
import {
  saveRevenueGoalAction,
  seedAppointmentReminderSequenceAction,
  seedQualificationFormAction,
  updateConversionEventAction,
  updateRevenueRecommendationAction
} from "./actions";
import { RevenueScanForm } from "./RevenueScanForm";

function money(cents: number | null) {
  if (cents === null) return "Not tracked";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function percent(value: number | null) {
  return value === null ? "Not tracked" : `${value}%`;
}

function ratio(value: number | null) {
  return value === null ? "Not tracked" : `${value.toFixed(1)}x`;
}

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function tone(value: string) {
  if (["critical", "high", "no_show", "open"].includes(value)) return "high";
  if (["medium", "needs_review", "snoozed"].includes(value)) return "medium";
  return "";
}

export default async function RevenueGrowthPage() {
  const dashboard = await getRevenueGrowthDashboard();

  return (
    <QueuePageShell
      eyebrow="Revenue Growth"
      title="Track Marketing To Money Collected"
      description="Ferocity connects leads, qualification, appointments, estimates, sales, invoices, payments, profit, reviews, and follow-up so the owner can see what creates booked income."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Closed-loop revenue system</p>
            <h2>Not impressions. Not raw leads. Money.</h2>
            <p className="muted">
              This view uses existing Ferocity records. Run the scan to refresh lead scores, attribution, conversion-event queue items,
              and Revenue Advisor recommendations. Customer messages follow the authority, consent, provider, and cost rules you choose.
            </p>
          </div>
          <div className="button-row">
            <RevenueScanForm />
            <Link className="button secondary-button" href="/app/marketing-os">Marketing OS</Link>
            <Link className="button secondary-button" href="/app/cash-collection">Money Queue</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        {[
          ["1", "Connect where leads come from", "Website forms, calls, email, MarketplacePro, ads, SEO pages, and referrals should carry a source."],
          ["2", "Run the revenue scan", "Ferocity scores leads, builds attribution, finds stale estimates and invoices, and prepares the next work."],
          ["3", "Choose the authority", "Review important actions, or let authorized routine reminders move through the guarded action queue automatically."],
          ["4", "Track money collected", "Revenue Growth ties source, lead, appointment, estimate, invoice, payment, profit, review, and repeat work together."]
        ].map(([step, title, body]) => (
          <section className="panel span-3" key={step}>
            <span className="pill">Step {step}</span>
            <h3>{title}</h3>
            <p className="muted">{body}</p>
          </section>
        ))}
      </section>

      <section className="grid section-actions">
        <Metric label="Ad spend" value={money(dashboard.metrics.adSpendCents)} icon={<CircleDollarSign size={16} />} />
        <Metric label="Leads" value={dashboard.metrics.leads} detail={`${money(dashboard.metrics.costPerLeadCents)} per lead`} icon={<BarChart3 size={16} />} />
        <Metric label="Qualified leads" value={dashboard.metrics.qualifiedLeads} detail={`${money(dashboard.metrics.costPerQualifiedLeadCents)} per qualified lead`} icon={<CheckCircle2 size={16} />} />
        <Metric label="Booked appointments" value={dashboard.metrics.bookedAppointments} detail={`${money(dashboard.metrics.costPerBookedAppointmentCents)} each`} icon={<ClipboardList size={16} />} />
        <Metric label="Show rate" value={percent(dashboard.metrics.showRate)} detail={`${percent(dashboard.metrics.noShowRate)} no-show`} icon={<Target size={16} />} />
        <Metric label="Close rate" value={percent(dashboard.metrics.closeRate)} detail={`${dashboard.metrics.estimatesSent} estimates/proposals`} icon={<Target size={16} />} />
        <Metric label="Sales" value={money(dashboard.metrics.totalSalesCents)} detail={`${money(dashboard.metrics.averageSaleCents)} average sale`} icon={<CircleDollarSign size={16} />} />
        <Metric label="Money collected" value={money(dashboard.metrics.collectedRevenueCents)} detail={`${ratio(dashboard.metrics.roas)} ROAS`} icon={<CircleDollarSign size={16} />} />
        <Metric label="Money still owed" value={money(dashboard.metrics.outstandingRevenueCents)} icon={<AlertTriangle size={16} />} tone={dashboard.metrics.outstandingRevenueCents > 0 ? "high" : ""} />
        <Metric label="Gross profit" value={money(dashboard.metrics.grossProfitCents)} detail="after tracked labor/material costs" icon={<CircleDollarSign size={16} />} />
        <Metric label="Customer cost" value={money(dashboard.metrics.customerAcquisitionCostCents)} detail="cost to get a sale" icon={<BarChart3 size={16} />} />
        <Metric label="Money at risk" value={money(dashboard.metrics.moneyAtRiskCents)} icon={<AlertTriangle size={16} />} tone={dashboard.metrics.moneyAtRiskCents > 0 ? "high" : ""} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Full Revenue Funnel</h2>
            <p className="muted">Click a stage to open the records or setup area behind it.</p>
          </div>
          <span className="pill">Traffic to repeat customer</span>
        </div>
        <div className="path-grid revenue-funnel-grid">
          {dashboard.stages.map((stage) => (
            <Link className="path-card" href={stage.href} key={stage.key}>
              <strong>{stage.label}</strong>
              <span className="metric-inline">{stage.value}</span>
              <small>{stage.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <div className="list-row flush-row">
            <div>
              <h2>Revenue Advisor</h2>
              <p className="muted">Problems, evidence, impact, and the next move. Approve creates Ferocity work items or setup records. It does not send messages or change ad spend.</p>
            </div>
            <span className="pill">{dashboard.recommendations.length} item(s)</span>
          </div>
          <ul className="list">
            {dashboard.recommendations.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.problem}</h3>
                  <p className="muted">{item.supportingData}</p>
                  <p>{item.recommendedAction}</p>
                  <p className="muted">Estimated impact: {money(item.estimatedRevenueImpactCents)} / confidence: {item.confidenceLevel}</p>
                </div>
                <div className="form-stack compact-actions">
                  <span className={`pill ${tone(item.priority)}`}>{item.priority}</span>
                  <span className="pill">{item.status}</span>
                  {item.actionHref ? <Link className="mini-button" href={item.actionHref}>Open</Link> : null}
                  <RecommendationButton id={item.id} status="approved" label="Approve" />
                  <RecommendationButton id={item.id} status="snoozed" label="Snooze" />
                  <RecommendationButton id={item.id} status="dismissed" label="Dismiss" />
                </div>
              </li>
            ))}
            {dashboard.recommendations.length === 0 ? (
              <li className="list-row"><span className="muted">Run the revenue scan to create recommendations.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-5" id="qualified-leads">
          <div className="list-row flush-row">
            <div>
              <h2>Qualified Lead Queue</h2>
              <p className="muted">Leads get a score, urgency, estimated value, next action, and reason. The starter form gives Ferocity better questions to qualify new leads.</p>
            </div>
          </div>
          <ul className="list">
            {dashboard.scoredLeads.map((lead) => (
              <li className="list-row" key={lead.id}>
                <div>
                  <h3><Link href={`/app/leads/${lead.leadId}`}>{lead.name}</Link></h3>
                  <p className="muted">Score {lead.score} / urgency {lead.urgency} / {money(lead.estimatedValueCents)}</p>
                  <p>{lead.nextAction}</p>
                  {lead.reason ? <p className="muted">{lead.reason}</p> : null}
                </div>
                <span className={`pill ${tone(lead.status)}`}>{lead.status}</span>
              </li>
            ))}
            {dashboard.scoredLeads.length === 0 ? (
              <li className="list-row"><span className="muted">No scored leads yet. Connect a form or lead source, then run Find Missed Money.</span></li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Qualification Forms</h2>
              <p className="muted">Plain questions that help Ferocity separate hot leads from weak-fit leads before sales time is wasted.</p>
            </div>
            <form action={seedQualificationFormAction}>
              <button className="mini-button" type="submit">Add starter form</button>
            </form>
          </div>
          <ul className="list">
            {dashboard.qualificationForms.map((form) => (
              <li className="list-row" key={form.id}>
                <div>
                  <h3>{form.name}</h3>
                  <p className="muted">{form.serviceLabel ?? "All services"} / {form.questionCount} question(s)</p>
                </div>
                <div className="button-row">
                  {form.publicFormPath ? <Link className="mini-button" href={form.publicFormPath} target="_blank">Open public form</Link> : null}
                  <span className={`pill ${tone(form.status)}`}>{form.status}</span>
                </div>
              </li>
            ))}
            {dashboard.qualificationForms.length === 0 ? (
              <li className="list-row"><span className="muted">No qualification form yet. Add the starter form, then tune it by service.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6" id="appointments">
          <div className="list-row flush-row">
            <div>
              <h2>Appointment Show-Up Plan</h2>
              <p className="muted">Booked jobs become tracked appointments. Ferocity prepares confirmation, 24-hour, 3-hour, and 30-minute reminders using each workspace&apos;s authority and contact rules.</p>
            </div>
            <form action={seedAppointmentReminderSequenceAction}>
              <button className="mini-button" type="submit">Add reminder plan</button>
            </form>
          </div>
          <ul className="list">
            {dashboard.followupSequences.map((sequence) => (
              <li className="list-row" key={sequence.id}>
                <div>
                  <h3>{sequence.name}</h3>
                  <p className="muted">{sequence.triggerType.replaceAll("_", " ")} / {sequence.stepCount} step(s)</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(sequence.status)}`}>{sequence.status}</span>
                  <span className="pill">{sequence.approvalRequired ? "review by default" : "auto by default"}</span>
                </div>
              </li>
            ))}
            {dashboard.followupSequences.length === 0 ? (
              <li className="list-row"><span className="muted">No revenue follow-up sequences yet. Add the reminder plan or approve the appointment recommendation.</span></li>
            ) : null}
          </ul>
          <h3 className="section-actions">Prepared reminders</h3>
          <ul className="list">
            {dashboard.appointmentReminders.map((reminder) => (
              <li className="list-row" key={reminder.id}>
                <div>
                  <strong>{reminder.label}</strong>
                  <p className="muted">{reminder.channel} / {reminder.contact} / {dateLabel(reminder.scheduledFor)}</p>
                </div>
                <span className={`pill ${tone(reminder.status)}`}>{reminder.status}</span>
              </li>
            ))}
            {dashboard.appointmentReminders.length === 0 ? (
              <li className="list-row"><span className="muted">No reminders are due yet. The automation loop creates them from scheduled jobs and booked appointments.</span></li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <BreakdownPanel title="Revenue By Source" rows={dashboard.sourceRows} />
        <BreakdownPanel title="Revenue By Salesperson" rows={dashboard.salespersonRows} />
        <BreakdownPanel title="Revenue By Service" rows={dashboard.serviceRows} />
        <BreakdownPanel title="Revenue By Location" rows={dashboard.locationRows} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Revenue Goal Calculator</h2>
          <p className="muted">Set a money goal. Ferocity works backward into leads, qualified leads, appointments, showed appointments, and sales.</p>
          <form action={saveRevenueGoalAction} className="form-stack">
            <input name="goalName" placeholder="Monthly collected revenue goal" defaultValue="Monthly collected revenue goal" />
            <div className="two-col">
              <input name="targetCollectedRevenue" inputMode="decimal" placeholder="Collected revenue target, e.g. 100000" />
              <input name="targetProfit" inputMode="decimal" placeholder="Profit target, e.g. 35000" />
            </div>
            <div className="two-col">
              <input name="targetAverageSale" inputMode="decimal" placeholder="Average sale, e.g. 4500" />
              <input name="targetReviewCount" inputMode="numeric" placeholder="Review goal, e.g. 20" />
            </div>
            <div className="two-col">
              <input name="targetShowRate" inputMode="decimal" placeholder="Show rate %, e.g. 75" />
              <input name="targetCloseRate" inputMode="decimal" placeholder="Close rate %, e.g. 30" />
            </div>
            <button className="button" type="submit">Save revenue goal</button>
          </form>
        </section>

        <section className="panel span-6">
          <h2>Active Goals</h2>
          <ul className="list">
            {dashboard.goals.map((goal) => (
              <li className="list-row" key={goal.id}>
                <div>
                  <h3>{goal.name}</h3>
                  <p className="muted">{goal.periodLabel} / target {money(goal.targetCollectedRevenueCents)} collected</p>
                  <p>
                    Needs about {goal.neededLeads} leads, {goal.neededQualifiedLeads} qualified leads, {goal.neededAppointments} appointments,
                    {" "}{goal.neededShowedAppointments} showed appointments, and {goal.neededSales} sales.
                  </p>
                </div>
                <span className="pill">{money(goal.targetAverageSaleCents)} avg sale</span>
              </li>
            ))}
            {dashboard.goals.length === 0 ? <li className="list-row"><span className="muted">No revenue goals yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Follow-Up Needed</h2>
          <p className="muted">Sales follow-up uses the Ferocity action queue. It can stay approval-first or run automatically when the owner grants that authority.</p>
          <ul className="list">
            {dashboard.followups.map((followup) => (
              <li className="list-row" key={followup.id}>
                <div>
                  <h3>{followup.title}</h3>
                  <p className="muted">{followup.detail}</p>
                  <p className="muted">Due: {dateLabel(followup.dueAt)}</p>
                </div>
                <span className="pill">{followup.status}</span>
              </li>
            ))}
            {dashboard.followups.length === 0 ? <li className="list-row"><span className="muted">No sales follow-up items are open.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Ad Feedback Queue</h2>
          <p className="muted">Test-mode conversion events for ad feedback once accounts are connected. Approving only marks them ready inside Ferocity; no platform upload happens here.</p>
          <ul className="list">
            {dashboard.conversionQueue.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.eventType.replaceAll("_", " ")}</h3>
                  <p className="muted">{event.provider} / {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(event.createdAt))}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(event.status)}`}>{event.status}</span>
                  <span className="pill">{event.consentChecked ? "consent checked" : "needs consent check"}</span>
                  {event.status === "needs_review" || event.status === "failed" ? (
                    <>
                      <ConversionEventButton id={event.id} status="approved" label="Mark ready" />
                      <ConversionEventButton id={event.id} status="skipped" label="Skip" />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {dashboard.conversionQueue.length === 0 ? <li className="list-row"><span className="muted">No conversion events yet. Run Find Missed Money after qualified leads or payments exist.</span></li> : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function ConversionEventButton({ id, status, label }: { id: string; status: "approved" | "skipped"; label: string }) {
  return (
    <form action={updateConversionEventAction}>
      <input name="eventId" type="hidden" value={id} />
      <input name="status" type="hidden" value={status} />
      <button className="mini-button" type="submit">{label}</button>
    </form>
  );
}

function RecommendationButton({ id, status, label }: { id: string; status: "approved" | "dismissed" | "snoozed" | "completed"; label: string }) {
  return (
    <form action={updateRevenueRecommendationAction}>
      <input name="recommendationId" type="hidden" value={id} />
      <input name="status" type="hidden" value={status} />
      <button className="mini-button" type="submit">{label}</button>
    </form>
  );
}

function Metric({ label, value, detail, icon, tone: toneName = "" }: { label: string; value: string | number; detail?: string; icon: React.ReactNode; tone?: string }) {
  return (
    <section className={`panel span-3 metric ${toneName}`}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
      <span className="metric-icon">{icon}</span>
    </section>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: RevenueBreakdownRow[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.label}>
            <div>
              <h3>{row.label}</h3>
              <p className="muted">
                {row.leads} leads / {row.qualified} qualified / {row.appointments} appointments / {row.sales} sales
              </p>
              <p className="muted">Spend {money(row.spendCents)} / ROAS {row.roas}</p>
            </div>
            <div className="inline-actions">
              <span className="pill">{money(row.collectedRevenueCents)}</span>
              <span className="pill">{money(row.grossProfitCents)} profit</span>
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">No tracked data yet.</span></li> : null}
      </ul>
    </section>
  );
}
