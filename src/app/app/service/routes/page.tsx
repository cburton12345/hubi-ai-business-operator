import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceRoutes } from "@/lib/service-ops/get-service-routes";

export default async function ServiceRoutesPage() {
  const routeDays = await getServiceRoutes();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Route Planning"
      description="Dispatcher view for scheduled and in-progress jobs over the next two weeks. This prepares routing structure without connecting a map or calendar API yet."
    >
      <div className="section-actions button-row">
        <Link className="button secondary-button" href="/app/service">Service command center</Link>
      </div>

      <div className="grid">
        {routeDays.map((day) => (
          <section className="panel span-12" key={day.day}>
            <h2>{day.day}</h2>
            <ul className="route-list">
              {day.jobs.map((job, index) => (
                <li className="route-stop" key={job.id}>
                  <strong className="route-stop-number">{index + 1}</strong>
                  <div>
                    <h3><Link href={job.href}>{job.title}</Link></h3>
                    <p>{job.customerName}</p>
                    <p className="muted">{job.schedule} / {job.assignedTo} / {job.serviceArea}</p>
                    <p className="muted">{job.serviceAddress}</p>
                    {job.dispatcherNotes ? <p>{job.dispatcherNotes}</p> : null}
                  </div>
                  <span className="pill">{job.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {routeDays.length === 0 ? (
          <section className="panel span-12">
            <h2>No routed jobs</h2>
            <p className="muted">Schedule jobs from the service command center or job detail pages to populate route planning.</p>
          </section>
        ) : null}
      </div>
    </QueuePageShell>
  );
}
