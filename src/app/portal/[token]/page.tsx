import { notFound } from "next/navigation";
import { getCustomerPortal } from "@/lib/service-ops/get-customer-portal";

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await getCustomerPortal(token);

  if (!portal) {
    notFound();
  }

  return (
    <main className="public-page">
      <section className="public-shell">
        <p className="eyebrow">{portal.organizationName}</p>
        <h1>{portal.customerName}</h1>
        <p className="muted">Customer portal summary for estimates, scheduled work, and invoices. Messages and payments are still handled manually by the business.</p>

        <div className="grid portal-summary">
          <section className="panel span-4">
            <h2>Profile</h2>
            <dl className="detail-grid">
              <Detail label="Status" value={portal.status} />
              <Detail label="Contact" value={portal.contact} />
              <div className="detail-wide">
                <dt>Service location</dt>
                <dd>{portal.location}</dd>
              </div>
            </dl>
          </section>
          <PortalList
            title="Estimates"
            empty="No shared estimates yet."
            rows={portal.estimates.map((estimate) => ({
              id: estimate.id,
              title: estimate.title,
              meta: `${estimate.total} / ${estimate.createdAt}`,
              status: estimate.status
            }))}
          />
          <PortalList
            title="Jobs"
            empty="No shared jobs yet."
            rows={portal.jobs.map((job) => ({
              id: job.id,
              title: job.title,
              meta: `${job.schedule} / ${job.serviceAddress}`,
              status: job.status
            }))}
          />
          <PortalList
            title="Invoices"
            empty="No shared invoices yet."
            rows={portal.invoices.map((invoice) => ({
              id: invoice.id,
              title: invoice.title,
              meta: `${invoice.total} / paid ${invoice.amountPaid} / due ${invoice.dueDate}`,
              status: invoice.status
            }))}
          />
          <PortalList
            title="Recurring Plans"
            empty="No active recurring plans yet."
            rows={portal.recurringPlans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              meta: `${plan.frequency} / next ${plan.nextServiceDate} / ${plan.price}`,
              status: "active"
            }))}
          />
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PortalList({
  title,
  empty,
  rows
}: {
  title: string;
  empty: string;
  rows: { id: string; title: string; meta: string; status: string }[];
}) {
  return (
    <section className="panel span-4">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              <p className="muted">{row.meta}</p>
            </div>
            <span className="pill">{row.status}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
