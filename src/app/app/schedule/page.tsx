import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getScheduleDashboard } from "@/lib/scheduling/get-schedule-dashboard";
import { nextVisitStatuses, type VisitStatus } from "@/lib/scheduling/visit-lifecycle";
import { CalendarFeedCreator } from "./CalendarFeedCreator";
import {
  assignVisitWorkerAction,
  createCustomerVisitLinkAction,
  revokeCalendarFeedAction,
  scanScheduleConflictsAction,
  scheduleVisitAction,
  updateVisitDispatchStatusAction,
  removeVisitWorkerAction
} from "./actions";

function dateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function displayTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

type ScheduleView = "day" | "week" | "team" | "all";

export default async function SchedulePage({
  searchParams
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const query = await searchParams;
  const view: ScheduleView = ["day", "week", "team", "all"].includes(query.view ?? "")
    ? query.view as ScheduleView
    : "week";
  const dashboard = await getScheduleDashboard();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const scheduledVisits = dashboard.scheduled
    .filter((visit) => {
      if (!visit.scheduledStart || view === "all" || view === "team") return true;
      const starts = new Date(visit.scheduledStart);
      return view === "day"
        ? starts >= startOfToday && starts < endOfToday
        : starts >= startOfToday && starts < endOfWeek;
    })
    .sort((a, b) => view === "team"
      ? (a.assignedWorkers || "Unassigned").localeCompare(b.assignedWorkers || "Unassigned")
      : new Date(a.scheduledStart || 0).getTime() - new Date(b.scheduledStart || 0).getTime());

  return (
    <QueuePageShell
      eyebrow="Schedule"
      title="Keep Every Promise On One Board"
      description="Schedule visits, match workers, detect conflicts, and move the field day from assigned to complete. Ferocity keeps legacy jobs and the new service kernel synchronized."
    >
      <div className="grid">
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Dispatch Health</h2>
              <p className="muted">
                Blocking conflicts prevent dispatch. Ferocity checks time overlap, working hours, time off, required skills,
                certifications, crew size, and service-location readiness.
              </p>
            </div>
            <div className="button-row">
              <form action={scanScheduleConflictsAction}>
                <button className="mini-button" type="submit">Check every visit</button>
              </form>
              <Link className="mini-button secondary-button" href="/app/crew-itinerary">Crew day</Link>
              <Link className="mini-button secondary-button" href="/employee">Field app</Link>
            </div>
          </div>
          <div className="snapshot-grid">
            <Metric label="Unscheduled" value={dashboard.metrics.unscheduled} />
            <Metric label="Scheduled" value={dashboard.metrics.scheduled} />
            <Metric label="Active now" value={dashboard.metrics.active} />
            <Metric label="Open conflicts" value={dashboard.metrics.conflicts} tone={dashboard.metrics.conflicts ? "medium" : ""} />
            <Metric label="Blocking" value={dashboard.metrics.blocking} tone={dashboard.metrics.blocking ? "high" : ""} />
          </div>
          <nav className="button-row section-actions" aria-label="Schedule view">
            <Link className={`mini-button ${view === "day" ? "" : "secondary-button"}`} href="/app/schedule?view=day">Today</Link>
            <Link className={`mini-button ${view === "week" ? "" : "secondary-button"}`} href="/app/schedule?view=week">Next 7 days</Link>
            <Link className={`mini-button ${view === "team" ? "" : "secondary-button"}`} href="/app/schedule?view=team">By team</Link>
            <Link className={`mini-button ${view === "all" ? "" : "secondary-button"}`} href="/app/schedule?view=all">All upcoming</Link>
          </nav>
        </section>

        <details className="panel span-12 progressive-disclosure">
          <summary>
            <div>
              <span className="eyebrow">Calendar connection</span>
              <h2>See this schedule in another calendar</h2>
              <p className="muted">Optional Google, Outlook, Apple, or other calendar subscription.</p>
            </div>
          </summary>
          <div className="progressive-disclosure-body">
            <p className="muted">The private calendar link stays synchronized. Anyone with the link can read the schedule, so revoke it if it is shared accidentally.</p>
            <CalendarFeedCreator />
            <ul className="list section-actions">
              {dashboard.calendarFeeds.map((feed) => (
                <li className="list-row" key={feed.id}>
                  <div>
                    <strong>{feed.label}</strong>
                    <p className="muted">Created {displayTime(feed.createdAt)} · {feed.lastUsedAt ? `last read ${displayTime(feed.lastUsedAt)}` : "not read yet"}</p>
                  </div>
                  {feed.status === "active" ? (
                    <form action={revokeCalendarFeedAction}>
                      <input type="hidden" name="feedId" value={feed.id} />
                      <button className="mini-button danger-button" type="submit">Revoke</button>
                    </form>
                  ) : <span className="pill">revoked</span>}
                </li>
              ))}
              {dashboard.calendarFeeds.length === 0 ? <li className="list-row"><span className="muted">No calendar subscriptions yet.</span></li> : null}
            </ul>
          </div>
        </details>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Unscheduled Work</span>
              <h2>Choose the promise before the day fills up</h2>
            </div>
            <span className="pill">{dashboard.unscheduled.length}</span>
          </div>
          <div className="grid">
            {dashboard.unscheduled.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                workers={dashboard.workers}
                serviceTypes={dashboard.serviceTypes}
              />
            ))}
            {dashboard.unscheduled.length === 0 ? (
              <section className="empty-state span-12">
                <h3>No work is waiting for a time</h3>
                <p>Approved work will appear here when it needs a visit.</p>
                <Link className="mini-button" href="/app/job-tracker">Create or approve work</Link>
              </section>
            ) : null}
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Upcoming And Active</span>
              <h2>{view === "day" ? "Today’s field day" : view === "week" ? "The next 7 days" : view === "team" ? "Work grouped by assigned team" : "All upcoming work"}</h2>
            </div>
            <span className="pill">{scheduledVisits.length}</span>
          </div>
          <div className="grid">
            {scheduledVisits.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                workers={dashboard.workers}
                serviceTypes={dashboard.serviceTypes}
              />
            ))}
            {scheduledVisits.length === 0 ? (
              <section className="empty-state span-12">
                <h3>No upcoming visits</h3>
                <p>Schedule work from the unscheduled tray above.</p>
              </section>
            ) : null}
          </div>
        </section>

        <details className="panel span-12 progressive-disclosure">
          <summary>
            <div>
              <span className="eyebrow">Team</span>
              <h2>People available for scheduling</h2>
              <p className="muted">Skills, certifications, and availability used when assigning work.</p>
            </div>
          </summary>
          <div className="progressive-disclosure-body">
            <Link className="mini-button" href="/app/operations-workforce">Manage team</Link>
            <ul className="list">
              {dashboard.workers.map((worker) => (
                <li className="list-row" key={worker.id}>
                  <div>
                    <h3>{worker.name}</h3>
                    <p className="muted">{worker.roleType.replaceAll("_", " ")}{worker.trade ? ` / ${worker.trade}` : ""}</p>
                    <p className="muted">Skills: {worker.skills || "Not added"} · Certifications: {worker.certifications || "Not added"}</p>
                  </div>
                  <span className="pill">{worker.availabilityStatus}</span>
                </li>
              ))}
              {dashboard.workers.length === 0 ? <li className="list-row"><span className="muted">Add workers before assigning visits.</span></li> : null}
            </ul>
          </div>
        </details>
      </div>
    </QueuePageShell>
  );
}

type Dashboard = Awaited<ReturnType<typeof getScheduleDashboard>>;

function VisitCard({
  visit,
  workers,
  serviceTypes
}: {
  visit: Dashboard["visits"][number];
  workers: Dashboard["workers"];
  serviceTypes: Dashboard["serviceTypes"];
}) {
  return (
    <article className="panel span-6" id={`visit-${visit.id}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{visit.customerName}</span>
          <h3>{visit.title}</h3>
        </div>
        <div className="button-row">
          <span className="pill">{visit.priority}</span>
          <span className="pill">{visit.status.replaceAll("_", " ")}</span>
        </div>
      </div>

      <p className="muted">{visit.locationName || "Service location"} · {visit.address || "Address needed"}</p>
      <p><strong>{displayTime(visit.scheduledStart)}</strong>{visit.scheduledEnd ? ` – ${displayTime(visit.scheduledEnd)}` : ""}</p>
      <p className="muted">
        Team: {visit.assignedWorkers || "Not assigned"} · {visit.assignedCount}/{visit.requiredCrewSize} workers · Customer {visit.confirmationStatus.replaceAll("_", " ")}
      </p>

      {visit.scheduledStart ? (
        <div className="notice">
          <strong>Customer appointment link</strong>
          {visit.customerVisitUrl ? (
            <>
              <p className="muted">
                Share this secure link by text or email. The customer can confirm or request a change without signing in.
              </p>
              <div className="inline-actions">
                <input aria-label="Customer appointment link" readOnly value={visit.customerVisitUrl} />
                <Link className="mini-button secondary-button" href={visit.customerVisitUrl} target="_blank">Preview</Link>
                <form action={createCustomerVisitLinkAction}>
                  <input type="hidden" name="visitId" value={visit.id} />
                  <button className="mini-button secondary-button" type="submit">Replace link</button>
                </form>
              </div>
            </>
          ) : (
            <form action={createCustomerVisitLinkAction}>
              <input type="hidden" name="visitId" value={visit.id} />
              <button className="mini-button" type="submit">Create secure link</button>
            </form>
          )}
        </div>
      ) : null}

      {visit.openConflicts ? (
        <div className={`notice ${visit.blockingConflicts ? "warning" : ""}`}>
          <strong>{visit.openConflicts} schedule conflict{visit.openConflicts === 1 ? "" : "s"}</strong>
          <p>{visit.blockingConflicts ? `${visit.blockingConflicts} must be fixed before dispatch.` : "Review before the field day."}</p>
        </div>
      ) : null}

      <details>
        <summary>Schedule or reschedule</summary>
        <form action={scheduleVisitAction} className="stacked-form compact-form">
          <input type="hidden" name="visitId" value={visit.id} />
          <label>
            Service type
            <select name="serviceTypeId" defaultValue="">
              <option value="">Keep current requirements</option>
              {serviceTypes.map((serviceType) => (
                <option key={serviceType.id} value={serviceType.id}>
                  {serviceType.name} · {serviceType.defaultDurationMinutes} min · {serviceType.requiredCrewSize} worker{serviceType.requiredCrewSize === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid two">
            <label>
              Starts
              <input type="datetime-local" name="scheduledStart" defaultValue={dateTimeLocal(visit.scheduledStart)} required />
            </label>
            <label>
              Ends
              <input type="datetime-local" name="scheduledEnd" defaultValue={dateTimeLocal(visit.scheduledEnd)} required />
            </label>
          </div>
          <button className="mini-button" type="submit">Reserve this time</button>
        </form>
      </details>

      <details>
        <summary>Assign a worker</summary>
        {visit.assignedWorkerList.length > 0 ? (
          <ul className="list">
            {visit.assignedWorkerList.map((worker) => (
              <li className="list-row" key={worker.id}>
                <span>{worker.name}</span>
                <form action={removeVisitWorkerAction}>
                  <input type="hidden" name="visitId" value={visit.id} />
                  <input type="hidden" name="workerId" value={worker.id} />
                  <button className="mini-button danger-button" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={assignVisitWorkerAction} className="inline-actions">
          <input type="hidden" name="visitId" value={visit.id} />
          <select name="workerId" required defaultValue="">
            <option value="" disabled>Choose worker</option>
            {workers.filter((worker) => !visit.assignedWorkerList.some((assigned) => assigned.id === worker.id)).map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name} · {worker.availabilityStatus}{worker.trade ? ` · ${worker.trade}` : ""}
              </option>
            ))}
          </select>
          <button className="mini-button" type="submit">Assign and check</button>
        </form>
      </details>

      <form action={updateVisitDispatchStatusAction} className="inline-actions">
        <input type="hidden" name="visitId" value={visit.id} />
        <select name="status" defaultValue={visit.status}>
          {nextVisitStatuses(visit.status as VisitStatus).map((status) => (
            <option value={status} key={status}>{status.replaceAll("_", " ")}</option>
          ))}
        </select>
        <button className="mini-button" type="submit">Update status</button>
        {visit.serviceJobId ? <Link className="mini-button secondary-button" href={`/app/service/jobs/${visit.serviceJobId}`}>Open job</Link> : null}
      </form>
    </article>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`snapshot-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
