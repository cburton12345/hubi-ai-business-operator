import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceRoutes } from "@/lib/service-ops/get-service-routes";

export default async function ServiceRoutesPage() {
  const routeDays = await getServiceRoutes();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Route Planning"
      description="Keyless dispatcher view for the next two weeks. Ferocity labels work by ZIP/city and preserves promised appointment order while advanced road optimization remains optional."
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
                    <p className="muted">Route cluster: {job.routeCluster || "location needed"}</p>
                    {job.dispatcherNotes ? <p>{job.dispatcherNotes}</p> : null}
                  </div>
                  <div className="button-row">
                    <span className="pill">{job.status}</span>
                    {job.directionsUrl ? <Link className="mini-button secondary-button" href={job.directionsUrl} target="_blank" rel="noreferrer">Directions</Link> : null}
                  </div>
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
