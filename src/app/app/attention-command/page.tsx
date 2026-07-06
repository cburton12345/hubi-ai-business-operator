import Link from "next/link";
import type React from "react";
import { AlertTriangle, BellRing, Bot, CalendarClock, CheckCircle2, CircleDollarSign, PlugZap, ShieldAlert, ShieldCheck } from "lucide-react";
import { rescheduleOwnerReminderAction, updateOwnerReminderStatusAction } from "@/app/app/notifications/actions";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import {
  getAttentionCommandDashboard,
  nudgeLabel,
  type AttentionCommandAction,
  type AttentionCommandNudge
} from "@/lib/attention-command/get-attention-command-dashboard";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function tone(value: string) {
  if (value === "critical" || value === "urgent" || value === "high" || value === "blocked") return "high";
  if (value === "medium" || value === "needs_review" || value === "needs_setup") return "medium";
  return "";
}

function dueLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time not set";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function plainStatus(value: string) {
  if (value === "configured" || value === "connected" || value === "ready") return "Ready";
  if (value === "missing" || value === "needs_setup" || value === "not_configured") return "Needs setup";
  return value.replaceAll("_", " ");
}

function isoMinutesFromNow(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString();
}

export default async function AttentionCommandPage() {
  const dashboard = await getAttentionCommandDashboard();
  const snoozeOneHour = isoMinutesFromNow(60);

  return (
    <QueuePageShell
      eyebrow="Today"
      title="What Needs Attention, What Makes Money, What Is Blocked"
      description="A plain owner view for decisions, risks, stuck work, missing connections, AI actions, and revenue follow-up."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">{dashboard.workspaceName}</p>
            <h2>Ferocity points to the next move.</h2>
            <p className="muted">{dashboard.briefing}</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/owner-command-center">Owner Feed</Link>
            <Link className="button secondary-button" href="/app/reports">Reports</Link>
            <Link className="button secondary-button" href="/app/automation-command">Automation</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">AI direction</p>
              <h2>{dashboard.direction.title}</h2>
              <p className="muted">{dashboard.direction.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${tone(dashboard.direction.urgency)}`}>{dashboard.direction.urgency}</span>
              <Link className="button" href={dashboard.direction.href}>Do this</Link>
            </div>
          </div>
        </section>
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Nudges</p>
              <h2>Ferocity will keep pushing the right things forward.</h2>
              <p className="muted">Critical items should interrupt. Revenue and owner decisions get same-day nudges. Lower priority work stays in the daily brief.</p>
            </div>
            <span className={`pill ${dashboard.metrics.nudges ? "medium" : ""}`}>
              <BellRing size={14} /> {dashboard.metrics.nudges} active
            </span>
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <Metric label="Needs owner" value={dashboard.metrics.ownerNeeds} icon={<AlertTriangle size={16} />} tone={dashboard.metrics.ownerNeeds ? "high" : ""} />
        <Metric label="Critical" value={dashboard.metrics.criticalIssues} icon={<ShieldAlert size={16} />} tone={dashboard.metrics.criticalIssues ? "high" : ""} />
        <Metric label="Blocked actions" value={dashboard.metrics.blockedActions} icon={<ShieldCheck size={16} />} tone={dashboard.metrics.blockedActions ? "high" : ""} />
        <Metric label="Needs review" value={dashboard.metrics.needsReview} icon={<CheckCircle2 size={16} />} tone={dashboard.metrics.needsReview ? "medium" : ""} />
        <Metric label="Open pipeline" value={money(dashboard.metrics.openPipelineCents)} icon={<CircleDollarSign size={16} />} />
        <Metric label="Collected" value={money(dashboard.metrics.collectedRevenueCents)} icon={<CircleDollarSign size={16} />} />
        <Metric label="Missing connections" value={dashboard.metrics.providerGaps} icon={<PlugZap size={16} />} tone={dashboard.metrics.providerGaps ? "high" : ""} />
        <Metric label="AI handled" value={dashboard.metrics.aiHandled} icon={<Bot size={16} />} />
        <Metric label="Due reminders" value={dashboard.metrics.dueReminders} icon={<CalendarClock size={16} />} tone={dashboard.metrics.dueReminders ? "high" : ""} />
        <Metric label="Active reminders" value={dashboard.metrics.activeReminders} icon={<BellRing size={16} />} tone={dashboard.metrics.activeReminders ? "medium" : ""} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Today&apos;s Reminders And Goals</h2>
            <p className="muted">Calls, meetings, daily goals, employee prompts, and owner reminders show here so the day starts in one place.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/notifications">Add reminder</Link>
            <Link className="button secondary-button" href="/app/notifications">Manage</Link>
          </div>
        </div>
        <ul className="list">
          {dashboard.reminders.map((reminder) => (
            <li className="list-row" key={reminder.id}>
              <div>
                <h3>{reminder.title}</h3>
                <p className="muted">{reminder.body ?? `${reminder.reminderType.replaceAll("_", " ")} reminder`}</p>
                <p>
                  {dueLabel(reminder.nextDueAt)}
                  {reminder.assigneeName || reminder.assigneeEmail ? ` for ${reminder.assigneeName ?? reminder.assigneeEmail}` : ""}
                </p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${tone(reminder.priority)}`}>{reminder.priority}</span>
                <span className={`pill ${tone(reminder.status)}`}>{reminder.status}</span>
                <form action={rescheduleOwnerReminderAction}>
                  <input name="reminderId" type="hidden" value={reminder.id} />
                  <input name="remindAt" type="hidden" value={snoozeOneHour} />
                  <input name="recurrence" type="hidden" value={reminder.recurrence} />
                  <button className="mini-button" type="submit">Snooze 1h</button>
                </form>
                <form action={updateOwnerReminderStatusAction}>
                  <input name="reminderId" type="hidden" value={reminder.id} />
                  <input name="status" type="hidden" value="completed" />
                  <button className="mini-button" type="submit">Done</button>
                </form>
                <form action={updateOwnerReminderStatusAction}>
                  <input name="reminderId" type="hidden" value={reminder.id} />
                  <input name="status" type="hidden" value={reminder.status === "paused" ? "active" : "paused"} />
                  <button className="mini-button" type="submit">{reminder.status === "paused" ? "Resume" : "Pause"}</button>
                </form>
                <Link className="mini-button" href={reminder.actionUrl || "/app/notifications"}>Open</Link>
              </div>
            </li>
          ))}
          {dashboard.reminders.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No reminders yet</h3>
                <p className="muted">Add calls, meetings, goals, invoice follow-ups, employee prompts, and personal owner tasks from Notifications.</p>
              </div>
              <Link className="mini-button" href="/app/notifications">Add one</Link>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Today&apos;s Owner Checklist</h2>
            <p className="muted">The practical stuff: send the follow-ups, collect money, handle paybacks, plan workers, review costs, and approve AI work.</p>
          </div>
          <Link className="mini-button" href="/app/text-queue">Text queue</Link>
        </div>
        <ul className="priority-list">
          {dashboard.checklist.map((item, index) => (
            <li className="priority-row" key={item.id}>
              <span className="priority-number">{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">{item.detail}</p>
                <p>{item.doneWhen}</p>
              </div>
              <span className={`pill ${tone(item.urgency)}`}>{item.count.toLocaleString()}</span>
              <Link className="mini-button" href={item.href}>{item.buttonLabel}</Link>
            </li>
          ))}
          {dashboard.checklist.length === 0 ? (
            <li className="priority-row">
              <span className="priority-number">1</span>
              <div>
                <h3>No owner checklist items right now</h3>
                <p className="muted">Ferocity will add items here when leads, invoices, field costs, schedules, missing connections, or AI actions need attention.</p>
              </div>
              <span className="pill low">clear</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="grid section-actions">
        <ActionPanel title="Do This First" body="Owner decisions, customer risk, failed automation, safety blockers, and missing connections rise to the top." actions={dashboard.doFirst} empty="Nothing urgent needs the owner right now." />
        <ActionPanel title="Make Money Next" body="Revenue, pipeline, unpaid invoices, open estimates, and lead follow-up without digging through reports." actions={dashboard.moneyMoves} empty="No money moves are ready yet." />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Active Nudge Queue</h2>
            <p className="muted">This is how Ferocity decides what to surface now, what to remind about today, and what can wait for the daily briefing.</p>
          </div>
          <Link className="mini-button" href="/app/notifications">Notification settings</Link>
        </div>
        <ul className="list">
          {dashboard.nudges.map((nudge) => (
            <NudgeRow key={`${nudge.nudgeMode}-${nudge.title}-${nudge.href}`} nudge={nudge} />
          ))}
          {dashboard.nudges.length === 0 ? <li className="list-row"><span className="muted">No active nudges right now.</span></li> : null}
        </ul>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Owner Queue</h2>
              <p className="muted">The short list Ferocity cannot or should not finish alone.</p>
            </div>
            <Link className="mini-button" href="/app/owner-command-center">Open</Link>
          </div>
          <ul className="list">
            {dashboard.ownerNeeds.map((need) => (
              <li className="list-row" key={need.id}>
                <div>
                  <h3>{need.title}</h3>
                  <p className="muted">{need.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(need.priority)}`}>{need.priority}</span>
                  <Link className="mini-button" href={need.href}>{need.actionLabel}</Link>
                </div>
              </li>
            ))}
            {dashboard.ownerNeeds.length === 0 ? <li className="list-row"><span className="muted">No owner queue items right now.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Safety And Blockers</h2>
              <p className="muted">Important actions, launch readiness, missing connections, limits, and safety blockers.</p>
            </div>
            <Link className="mini-button" href="/app/safety-readiness">Open</Link>
          </div>
          <ul className="list">
            {dashboard.safetyNeeds.map((item) => (
              <li className="list-row" key={`${item.href}-${item.title}`}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
                  <Link className="mini-button" href={item.href}>{item.button}</Link>
                </div>
              </li>
            ))}
            {dashboard.safetyNeeds.length === 0 ? <li className="list-row"><span className="muted">No safety blockers right now.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>AI Actions Feed</h2>
              <p className="muted">What Ferocity already handled or marked as handled so the owner sees progress.</p>
            </div>
            <Link className="mini-button" href="/app/owner-command-center">Open feed</Link>
          </div>
          <ul className="list">
            {dashboard.aiActions.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">{event.aiSummary ?? event.summary}</p>
                </div>
                <span className="pill">{event.platformName}</span>
              </li>
            ))}
            {dashboard.aiActions.length === 0 ? <li className="list-row"><span className="muted">No AI-handled events yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Missing Connections</h2>
              <p className="muted">The outside accounts Ferocity still needs before it can send, collect, post, import, or track more automatically.</p>
            </div>
            <Link className="mini-button" href="/app/integrations">Connect</Link>
          </div>
          <ul className="list">
            {dashboard.providerGaps.map((gap) => (
              <li className="list-row" key={gap.provider}>
                <div>
                  <h3>{gap.displayName}</h3>
                  <p className="muted">{gap.nextStep}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(gap.status)}`}>{gap.status}</span>
                  <span className={`pill ${tone(gap.credentialsStatus)}`}>{plainStatus(gap.credentialsStatus)}</span>
                </div>
              </li>
            ))}
            {dashboard.providerGaps.length === 0 ? <li className="list-row"><span className="muted">No missing connections found.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Which Marketing Is Producing Work?</h2>
            <p className="muted">A short ROI view. Open full reports for channel, service, city, reputation, and analytics detail.</p>
          </div>
          <Link className="mini-button" href="/app/reports">Full reports</Link>
        </div>
        <div className="grid">
          {dashboard.channelRoi.map((row) => (
            <section className="metric-card span-4" key={row.label}>
              <small className="pill">{row.roiLabel}</small>
              <strong>{money(row.revenueCents)}</strong>
              <span>{row.label}: {row.leads} leads / {row.jobs} jobs</span>
            </section>
          ))}
          {dashboard.channelRoi.length === 0 ? <p className="muted">No channel ROI data yet.</p> : null}
        </div>
      </section>
    </QueuePageShell>
  );
}

function NudgeRow({ nudge }: { nudge: AttentionCommandNudge }) {
  return (
    <li className="list-row">
      <div>
        <h3>{nudge.title}</h3>
        <p className="muted">{nudge.detail}</p>
        <p>{nudge.reason}</p>
      </div>
      <div className="inline-actions">
        <span className={`pill ${tone(nudge.urgency)}`}>{nudgeLabel(nudge.nudgeMode)}</span>
        <Link className="mini-button" href={nudge.href}>Open</Link>
      </div>
    </li>
  );
}

function ActionPanel({ title, body, actions, empty }: { title: string; body: string; actions: AttentionCommandAction[]; empty: string }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <ul className="list">
        {actions.map((action, index) => (
          <li className="list-row" key={`${title}-${action.title}-${action.href}-${index}`}>
            <div>
              <h3>{action.title}</h3>
              <p className="muted">{action.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${tone(action.urgency)}`}>{action.urgency}</span>
              <Link className="mini-button" href={action.href}>Open</Link>
            </div>
          </li>
        ))}
        {actions.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

function Metric({ label, value, icon, tone: toneName = "" }: { label: string; value: number | string; icon: React.ReactNode; tone?: string }) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${toneName}`}>{icon} attention</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
