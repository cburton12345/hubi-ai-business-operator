import Link from "next/link";
import type React from "react";
import { BellRing, CalendarClock, CheckCircle2, CircleAlert, Send } from "lucide-react";
import {
  createOwnerReminderAction,
  rescheduleOwnerReminderAction,
  updateOwnerReminderStatusAction,
  updatePushNotificationPreferences
} from "@/app/app/notifications/actions";
import { PushNotificationSetup } from "@/components/PushNotificationSetup";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPushNotificationDashboard } from "@/lib/push/get-push-notification-dashboard";

function dateLabel(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function tone(value: string) {
  if (["failed", "expired", "revoked", "denied", "blocked"].includes(value)) return "high";
  if (["skipped", "paused", "default"].includes(value)) return "medium";
  return "";
}

function inputDateTimeValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return dateTimeLocalValue(date);
}

function dateTimeLocalValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export default async function NotificationsPage() {
  const dashboard = await getPushNotificationDashboard();

  return (
    <QueuePageShell
      eyebrow="Notifications"
      title="App Alerts And Email Notifications"
      description="Use Ferocity app alerts for urgent owner attention and verified email for customer or owner messages."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Recommended notification setup</p>
            <h2>Install the app, turn on alerts, and let email handle the rest.</h2>
            <p className="muted">
              Urgent items go to the app, customer-facing or owner summary messages can use verified email, and every event still lands in
              Needs Attention or Owner Events.
            </p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/install">Install App</Link>
            <Link className="button secondary-button" href="/app/attention-command">Needs Attention</Link>
            <Link className="button secondary-button" href="/app/automation-command">Automation Rules</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <h2>What each channel is for</h2>
        <div className="path-grid">
          <div className="path-card">
            <BellRing size={18} />
            <strong>App alerts</strong>
            <span>Hot leads, owner approvals, failed automations, payment risk, safety issues, and urgent decisions.</span>
          </div>
          <div className="path-card">
            <Send size={18} />
            <strong>Email</strong>
            <span>Setup messages, owner summaries, customer follow-up drafts, reports, Stripe payment-link notices when configured, and longer notices.</span>
          </div>
          <div className="path-card">
            <CircleAlert size={18} />
            <strong>Command center</strong>
            <span>Everything still lands in Needs Attention and Owner Events, even when a device or inbox is quiet.</span>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Active devices" value={dashboard.metrics.activeSubscriptions} icon={<BellRing size={16} />} />
        <Metric label="Failed devices" value={dashboard.metrics.failedSubscriptions} icon={<CircleAlert size={16} />} tone={dashboard.metrics.failedSubscriptions ? "high" : ""} />
        <Metric label="Sent" value={dashboard.metrics.sentEvents} icon={<Send size={16} />} />
        <Metric label="Failed sends" value={dashboard.metrics.failedEvents} icon={<CircleAlert size={16} />} tone={dashboard.metrics.failedEvents ? "high" : ""} />
        <Metric label="Skipped" value={dashboard.metrics.skippedEvents} icon={<CheckCircle2 size={16} />} tone={dashboard.metrics.skippedEvents ? "medium" : ""} />
        <Metric label="Missing keys" value={dashboard.readiness.missing.length} icon={<CircleAlert size={16} />} tone={dashboard.readiness.missing.length ? "high" : ""} />
        <Metric label="Active reminders" value={dashboard.metrics.activeReminders} icon={<CalendarClock size={16} />} />
        <Metric label="Due now" value={dashboard.metrics.dueReminders} icon={<BellRing size={16} />} tone={dashboard.metrics.dueReminders ? "high" : ""} />
        <Metric label="Daily goals" value={dashboard.metrics.dailyGoals} icon={<CheckCircle2 size={16} />} />
      </section>

      <PushNotificationSetup />

      <section className="grid section-actions">
        <section className="panel span-5">
          <p className="eyebrow">Daily goals and meetings</p>
          <h2>Create a push reminder</h2>
          <p className="muted">
            Use this for meetings, daily goals, job check-ins, employee tasks, payment follow-up, or anything the owner or team should not forget.
            Owner reminders can follow the signed-in owner across business workspaces.
          </p>
          <form action={createOwnerReminderAction} className="form-stack section-actions">
            <label>
              Who should get it?
              <select name="recipientUserId" defaultValue={dashboard.assignees[0]?.userId ?? ""}>
                {dashboard.assignees.map((assignee) => (
                  <option key={assignee.userId} value={assignee.userId}>
                    {assignee.name || assignee.email} / {assignee.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input name="title" placeholder="Morning job plan" required />
            </label>
            <label>
              Notes
              <textarea name="body" rows={3} placeholder="Review today's jobs, field costs, worker assignments, and overdue payments." />
            </label>
            <div className="form-grid">
              <label>
                Type
                <select name="reminderType" defaultValue="goal">
                  <option value="goal">Daily goal</option>
                  <option value="meeting">Meeting</option>
                  <option value="task">Task</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="payment">Payment</option>
                  <option value="personal">Personal</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Remind me
                <input name="remindAt" type="datetime-local" defaultValue={inputDateTimeValue()} required />
              </label>
              <label>
                Repeat
                <select name="recurrence" defaultValue="none">
                  <option value="none">One time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
            </div>
            <label>
              Opens page
              <select name="actionUrl" defaultValue="/app/attention-command">
                <option value="/app/attention-command">Needs Attention</option>
                <option value="/app/job-tracker">Job Tracker</option>
                <option value="/app/operations-workforce">Operations & Workforce</option>
                <option value="/app/cash-collection">Cash Collection</option>
                <option value="/app/text-queue">Text Queue</option>
                <option value="/app/owner-command-center">Owner Events</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input name="pushEnabled" type="checkbox" defaultChecked />
              <span>Send this as a push notification when due.</span>
            </label>
            <button className="button" type="submit">
              <BellRing size={16} /> Create reminder
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <h2>Upcoming reminders</h2>
          <ul className="list">
            {dashboard.reminders.map((reminder) => (
              <li className="list-row" key={reminder.id}>
                <div>
                  <h3>{reminder.title}</h3>
                  <p className="muted">
                    {reminder.reminderType.replaceAll("_", " ")} / {reminder.priority} / {dateLabel(reminder.nextDueAt)}
                    {reminder.recurrence !== "none" ? ` / repeats ${reminder.recurrence}` : ""}
                  </p>
                  <p className="muted">
                    For {reminder.assigneeName || reminder.assigneeEmail || "workspace"}{reminder.pushEnabled ? " / push on" : " / push off"}
                  </p>
                  {reminder.body ? <p>{reminder.body}</p> : null}
                  <form action={rescheduleOwnerReminderAction} className="inline-actions">
                    <input name="reminderId" type="hidden" value={reminder.id} />
                    <input name="remindAt" type="datetime-local" defaultValue={dateTimeLocalValue(reminder.nextDueAt)} aria-label={`Reschedule ${reminder.title}`} />
                    <select name="recurrence" defaultValue={reminder.recurrence} aria-label={`Repeat for ${reminder.title}`}>
                      <option value="none">One time</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                    <button className="mini-button" type="submit">Save time</button>
                  </form>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(reminder.status)}`}>{reminder.status}</span>
                  <form action={updateOwnerReminderStatusAction}>
                    <input name="reminderId" type="hidden" value={reminder.id} />
                    <input name="status" type="hidden" value={reminder.status === "paused" ? "active" : "paused"} />
                    <button className="mini-button" type="submit">{reminder.status === "paused" ? "Resume" : "Pause"}</button>
                  </form>
                  <form action={updateOwnerReminderStatusAction}>
                    <input name="reminderId" type="hidden" value={reminder.id} />
                    <input name="status" type="hidden" value="completed" />
                    <button className="mini-button" type="submit">Done</button>
                  </form>
                </div>
              </li>
            ))}
            {dashboard.reminders.length === 0 ? (
              <li className="list-row"><span className="muted">No owner reminders yet. Add a daily goal, meeting, or job reminder.</span></li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Alert rules</p>
            <h2>Choose what is worth interrupting you.</h2>
            <p className="muted">
              Ferocity still records every event in the command center. These settings only decide what can become a device push alert.
            </p>
          </div>
          <span className={`pill ${dashboard.preferences.ownerAlertsEnabled ? "" : "medium"}`}>
            {dashboard.preferences.ownerAlertsEnabled ? "alerts on" : "alerts paused"}
          </span>
        </div>
        <form action={updatePushNotificationPreferences} className="settings-form">
          <label className="toggle-row">
            <input name="ownerAlertsEnabled" type="checkbox" defaultChecked={dashboard.preferences.ownerAlertsEnabled} />
            <span>
              <strong>Owner push alerts</strong>
              <small>Turn off to keep events in Ferocity without buzzing devices.</small>
            </span>
          </label>

          <div className="form-grid">
            <label>
              Minimum severity
              <select name="minSeverity" defaultValue={dashboard.preferences.minSeverity}>
                <option value="medium">Medium and higher</option>
                <option value="high">High and critical</option>
                <option value="critical">Critical only</option>
                <option value="low">Low and higher</option>
                <option value="info">Everything</option>
              </select>
            </label>
            <label>
              Money threshold
              <input name="minMoneyDollars" type="number" min="0" step="25" defaultValue={Math.round(dashboard.preferences.minMoneyCents / 100)} />
            </label>
          </div>

          <div className="mini-grid">
            <PreferenceToggle name="notifyRevenue" label="Revenue opportunities" checked={dashboard.preferences.notifyRevenue} />
            <PreferenceToggle name="notifyFinancial" label="Payment or cash risk" checked={dashboard.preferences.notifyFinancial} />
            <PreferenceToggle name="notifyCustomer" label="Customer issues" checked={dashboard.preferences.notifyCustomer} />
            <PreferenceToggle name="notifyLegal" label="Legal concerns" checked={dashboard.preferences.notifyLegal} />
            <PreferenceToggle name="notifySafety" label="Safety concerns" checked={dashboard.preferences.notifySafety} />
            <PreferenceToggle name="notifyAutomation" label="Automation failures" checked={dashboard.preferences.notifyAutomation} />
            <PreferenceToggle name="notifyLowConfidence" label="Low confidence AI" checked={dashboard.preferences.notifyLowConfidence} />
            <PreferenceToggle name="notifyApproval" label="Approval needed" checked={dashboard.preferences.notifyApproval} />
          </div>

          <button className="button" type="submit">Save alert rules</button>
        </form>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Connected Devices</h2>
          <ul className="list">
            {dashboard.subscriptions.map((subscription) => (
              <li className="list-row" key={subscription.id}>
                <div>
                  <h3>{subscription.userAgent.slice(0, 80)}</h3>
                  <p className="muted">Last seen {dateLabel(subscription.lastSeenAt)} / last success {dateLabel(subscription.lastSuccessAt)}</p>
                  {subscription.lastError ? <p className="muted">{subscription.lastError}</p> : null}
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(subscription.permission)}`}>{subscription.permission}</span>
                  <span className={`pill ${tone(subscription.status)}`}>{subscription.status}</span>
                </div>
              </li>
            ))}
            {dashboard.subscriptions.length === 0 ? <li className="list-row"><span className="muted">No push devices have opted in yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Recent Push Events</h2>
          <ul className="list">
            {dashboard.events.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">{event.eventType} / {dateLabel(event.createdAt)}</p>
                  <p>{event.body}</p>
                  {event.errorMessage ? <p className="muted">{event.errorMessage}</p> : null}
                </div>
                <span className={`pill ${tone(event.status)}`}>{event.status}</span>
              </li>
            ))}
            {dashboard.events.length === 0 ? <li className="list-row"><span className="muted">No push events have been recorded yet.</span></li> : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function PreferenceToggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="toggle-row compact-toggle">
      <input name={name} type="checkbox" defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
}

function Metric({ label, value, icon, tone: toneName = "" }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${toneName}`}>{icon} push</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
