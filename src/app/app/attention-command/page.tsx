import Link from "next/link";
import type React from "react";
import { BellRing, Bot, CircleDollarSign, Sparkles, TriangleAlert } from "lucide-react";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { rescheduleOwnerReminderAction, updateOwnerReminderStatusAction } from "@/app/app/notifications/actions";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import type { AttentionCommandAction } from "@/lib/attention-command/get-attention-command-dashboard";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { getTodayOverview } from "@/lib/dashboard/get-today-overview";
import { getOwnerRemindersDashboard } from "@/lib/reminders/owner-reminders";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function tone(value: string) {
  if (["critical", "urgent", "high", "blocked"].includes(value)) return "high";
  if (["medium", "needs_review", "needs_setup"].includes(value)) return "medium";
  return "";
}

function dueLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not set";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function isoMinutesFromNow(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString();
}

export default async function AttentionCommandPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const [dashboard, actor, reminderDashboard] = await Promise.all([
    getTodayOverview(workspaceId),
    getCurrentActor(),
    getOwnerRemindersDashboard(workspaceId),
  ]);
  const isPlatformAdmin = actor.platformRole === "super_admin";
  const snoozeOneHour = isoMinutesFromNow(60);
  const setupNeeds = [
    ...dashboard.providerGaps.map((gap) => ({ title: `${gap.displayName} needs attention`, detail: gap.nextStep, href: "/app/integrations" })),
    ...(isPlatformAdmin ? [{ title: "Review platform safety and readiness", detail: "Open the platform safety board before enabling consequential live actions.", href: "/app/safety-readiness" }] : [])
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.title === item.title) === index).slice(0, 4);
  const customerSafeDoFirst = dashboard.doFirst.filter((action) => isPlatformAdmin || !isInternalControl(action));

  return <QueuePageShell eyebrow="Today" title="What needs you—and what Ferocity is moving" description="One owner view for decisions, revenue, reminders, and work that cannot safely move without you.">
    <section className="panel attention-summary">
      <div><p className="eyebrow">{dashboard.workspaceName}</p><h2>{dashboard.direction.title}</h2><p className="muted">{dashboard.direction.detail}</p></div>
      <Link className="button" href={dashboard.direction.href}>Take the next step</Link>
    </section>

    <section className="grid section-actions" aria-label="Business pulse">
      <Metric context="now" label="Needs you" value={customerSafeDoFirst.length} icon={<TriangleAlert size={16} />} tone={customerSafeDoFirst.length ? "high" : ""} href="#needs-you" />
      <Metric context="due" label="Due today" value={reminderDashboard.metrics.dueNow} icon={<BellRing size={16} />} tone={reminderDashboard.metrics.dueNow ? "medium" : ""} href="#reminders" />
      <Metric context="pipeline" label="Open pipeline" value={money(dashboard.openPipelineCents)} icon={<CircleDollarSign size={16} />} href="/app/lead-command" />
      <Metric context="recorded" label="Collected" value={money(dashboard.collectedRevenueCents)} icon={<CircleDollarSign size={16} />} href="/app/reports" />
    </section>

    <section className="panel simple-ask-card">
      <div><p className="eyebrow">Ask Ferocity</p><h2>Change the plan in normal words.</h2><p className="muted">Ask what matters, hand off a task, or tell Ferocity what result you want next.</p></div>
      <form className="simple-ask-form" action={executeAiWorkforceCommandSimpleAction}><label className="sr-only" htmlFor="today-command">What should Ferocity do?</label><textarea id="today-command" name="command" placeholder="Example: Handle every safe follow-up and show me only the decisions that need me." minLength={8} maxLength={2000} rows={3} required /><button className="button" type="submit"><Sparkles size={16} /> Ask Ferocity</button></form>
    </section>

    <section className="grid section-actions" id="needs-you">
      <ActionPanel title="Do first" body="The shortest list of decisions or risks that deserve attention now." actions={customerSafeDoFirst.slice(0, 4)} empty="Nothing urgent needs you right now." />
      <ActionPanel title="Make money next" body="The clearest revenue, follow-up, estimate, or collection opportunities." actions={dashboard.moneyMoves.slice(0, 4)} empty="No immediate money move is waiting." />
    </section>

    <section className="panel section-actions" id="reminders">
      <div className="list-row flush-row"><div><p className="eyebrow">Today</p><h2>Reminders</h2></div><Link className="mini-button" href="/app/notifications">Manage reminders</Link></div>
      <ul className="list">{reminderDashboard.reminders.slice(0, 3).map((reminder) => <li className="list-row" key={reminder.id}><div><strong>{reminder.title}</strong><p className="muted">{reminder.body ?? "Business reminder"} · {dueLabel(reminder.nextDueAt)}</p></div><div className="inline-actions"><form action={rescheduleOwnerReminderAction}><input name="reminderId" type="hidden" value={reminder.id} /><input name="remindAt" type="hidden" value={snoozeOneHour} /><input name="recurrence" type="hidden" value={reminder.recurrence} /><button className="mini-button" type="submit">Snooze</button></form><form action={updateOwnerReminderStatusAction}><input name="reminderId" type="hidden" value={reminder.id} /><input name="status" type="hidden" value="completed" /><button className="mini-button" type="submit">Done</button></form></div></li>)}{reminderDashboard.reminders.length === 0 ? <li className="list-row"><span className="muted">No reminders are due.</span></li> : null}</ul>
    </section>

    <section className="grid section-actions">
      <section className="panel span-6"><div className="list-row flush-row"><div><p className="eyebrow">Handled</p><h2>What Ferocity moved forward</h2></div><Bot size={20} /></div><ul className="list">{dashboard.aiActions.map((event) => <li className="list-row" key={event.id}><div><strong>{event.title}</strong><p className="muted">{event.ai_summary ?? event.summary}</p></div></li>)}{dashboard.aiActions.length === 0 ? <li className="list-row"><span className="muted">Completed Ferocity work will appear here.</span></li> : null}</ul></section>
      <section className="panel span-6"><div className="list-row flush-row"><div><p className="eyebrow">Cannot move yet</p><h2>Connections or controls to finish</h2></div><Link className="mini-button" href="/app/integrations">Connections</Link></div><ul className="list">{setupNeeds.map((item) => <li className="list-row" key={item.title}><div><strong>{item.title}</strong><p className="muted">{item.detail}</p></div><Link className="mini-button" href={item.href}>Fix</Link></li>)}{setupNeeds.length === 0 ? <li className="list-row"><span className="muted">No setup issue is blocking the next step.</span></li> : null}</ul></section>
    </section>
  </QueuePageShell>;
}

function isInternalControl(action: AttentionCommandAction) {
  const text = `${action.title} ${action.detail} ${action.href}`.toLowerCase();
  return ["automation trust", "safety check", "safety-readiness", "operator alert", "app error", "action queue", "go-live checklist"].some((term) => text.includes(term));
}

function ActionPanel({ title, body, actions, empty }: { title: string; body: string; actions: AttentionCommandAction[]; empty: string }) {
  return <section className="panel span-6"><h2>{title}</h2><p className="muted">{body}</p><ul className="list">{actions.map((action, index) => <li className="list-row" key={`${title}-${action.title}-${index}`}><div><strong>{action.title}</strong><p className="muted">{action.detail}</p></div><div className="inline-actions"><span className={`pill ${tone(action.urgency)}`}>{action.urgency}</span><Link className="mini-button" href={action.href}>Open</Link></div></li>)}{actions.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}</ul></section>;
}

function Metric({ context, label, value, icon, href, tone: toneName = "" }: { context: string; label: string; value: number | string; icon: React.ReactNode; href: string; tone?: string }) {
  return <Link aria-label={`${label}: ${value}`} className="metric-card span-3" href={href}><small className={`pill ${toneName}`}>{icon} {context}</small><strong>{value}</strong><span>{label}</span></Link>;
}
