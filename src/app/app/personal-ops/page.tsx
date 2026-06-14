import { Bot, CheckCircle2, Clock, DollarSign, FileText, UserRoundCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPersonalOpsDashboard, type PersonalOpsItem } from "@/lib/personal-ops/get-personal-ops";
import { createPersonalOpsItemAction, updatePersonalOpsItemAction } from "./actions";

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function priorityClass(priority: string) {
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "normal") return "medium";
  return "";
}

export default async function PersonalOpsPage() {
  const dashboard = await getPersonalOpsDashboard();

  return (
    <QueuePageShell
      eyebrow="Private owner layer"
      title="Personal Ops"
      description="A private queue for the owner's reminders, people to contact, paperwork, money items, waiting-on-someone tasks, and personal projects. Important items can surface in Owner Command without becoming customer CRM records."
    >
      <section className="grid section-actions">
        <Metric label="Open" value={dashboard.metrics.open} icon={<Clock size={18} />} />
        <Metric label="Needs me" value={dashboard.metrics.needsOwner} icon={<UserRoundCheck size={18} />} tone={dashboard.metrics.needsOwner ? "high" : ""} />
        <Metric label="Critical" value={dashboard.metrics.critical} icon={<FileText size={18} />} tone={dashboard.metrics.critical ? "high" : ""} />
        <Metric label="Due soon" value={dashboard.metrics.dueSoon} icon={<Clock size={18} />} tone={dashboard.metrics.dueSoon ? "medium" : ""} />
        <Metric label="Waiting" value={dashboard.metrics.waiting} icon={<Clock size={18} />} />
        <Metric label="AI handled" value={dashboard.metrics.aiHandled} icon={<Bot size={18} />} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Add Personal Item</h2>
          <p className="muted">Use this for owner-only work. Keep customer leads, jobs, invoices, and reviews in their normal Ferocity areas.</p>
          <form action={createPersonalOpsItemAction} className="stacked-form">
            <label>
              What needs attention?
              <input name="title" placeholder="Renew insurance, call CPA, check trailer registration..." required />
            </label>
            <label>
              Notes
              <textarea name="notes" placeholder="Add context, link, phone number, or what done means." rows={4} />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select name="category" defaultValue="today">
                  <option value="today">Today</option>
                  <option value="money">Money</option>
                  <option value="paperwork">Legal / paperwork</option>
                  <option value="people">People to contact</option>
                  <option value="reminder">Reminder</option>
                  <option value="project">Personal project</option>
                  <option value="waiting">Waiting on someone</option>
                  <option value="personal">Personal</option>
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>
            <label>
              Due date
              <input name="dueAt" type="datetime-local" />
            </label>
            <button className="button" type="submit">Add To Personal Ops</button>
          </form>
        </section>

        <section className="panel span-7">
          <h2>Needs Me</h2>
          <ItemList items={dashboard.needsOwner} empty="No private owner items need a decision right now." />
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Due Soon</h2>
          <ItemList items={dashboard.dueSoon} empty="Nothing private is due soon." />
        </section>
        <section className="panel span-6">
          <h2>Waiting On Someone</h2>
          <ItemList items={dashboard.waiting} empty="No waiting-on-someone items yet." />
        </section>
      </section>

      <section className="panel section-actions">
        <h2>All Personal Ops</h2>
        <ItemList items={dashboard.items} empty="No personal ops items yet." />
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon, tone = "" }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${tone}`}>{icon} private</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

function ItemList({ items, empty }: { items: PersonalOpsItem[]; empty: string }) {
  return (
    <ul className="queue-list">
      {items.map((item) => (
        <li className="list-row" key={item.id}>
          <div>
            <div className="inline-actions">
              <span className={`pill ${priorityClass(item.priority)}`}>{item.priority}</span>
              <span className="pill">{item.category.replaceAll("_", " ")}</span>
              <span className="pill">{item.status.replaceAll("_", " ")}</span>
              <span className="pill">{dateLabel(item.dueAt)}</span>
            </div>
            <h3>{item.title}</h3>
            {item.notes ? <p className="muted">{item.notes}</p> : null}
            {item.recommendedAction ? <p className="muted">{item.recommendedAction}</p> : null}
            {item.aiSummary ? <p className="muted">AI note: {item.aiSummary}</p> : null}
          </div>
          <div className="button-row">
            <StatusButton itemId={item.id} nextStatus="watching" label="Watch" />
            <StatusButton itemId={item.id} nextStatus="ai_handled" label="AI handled" />
            <StatusButton itemId={item.id} nextStatus="done" label="Done" primary />
          </div>
        </li>
      ))}
      {items.length === 0 ? (
        <li className="list-row">
          <div>
            <CheckCircle2 size={18} />
            <span className="muted">{empty}</span>
          </div>
        </li>
      ) : null}
    </ul>
  );
}

function StatusButton({ itemId, nextStatus, label, primary = false }: { itemId: string; nextStatus: string; label: string; primary?: boolean }) {
  return (
    <form action={updatePersonalOpsItemAction}>
      <input name="itemId" type="hidden" value={itemId} />
      <input name="nextStatus" type="hidden" value={nextStatus} />
      <button className={primary ? "mini-button" : "mini-button secondary-button"} type="submit">{label}</button>
    </form>
  );
}
