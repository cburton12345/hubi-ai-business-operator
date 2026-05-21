import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { disableCustomerPortalAction, enableCustomerPortalAction } from "@/app/app/service/actions";
import { getCustomerDetail } from "@/lib/service-ops/get-customer-detail";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const customer = await getCustomerDetail(customerId);

  if (!customer) {
    notFound();
  }

  return (
    <QueuePageShell
      eyebrow="Customer"
      title={customer.name}
      description="Customer profile, lead source, service work, estimates, jobs, and invoices for the selected organization."
    >
      <div className="grid">
        <section className="panel span-6">
          <h2>Profile</h2>
          <dl className="detail-grid">
            <Detail label="Email" value={customer.email || "Not provided"} />
            <Detail label="Phone" value={customer.phone || "Not provided"} />
            <Detail label="Location" value={customer.location} />
            <Detail label="Status" value={customer.status} />
            <div className="detail-wide">
              <dt>AI summary</dt>
              <dd>{customer.aiSummary || "No summary yet."}</dd>
            </div>
            <div className="detail-wide">
              <dt>Notes</dt>
              <dd>{customer.notes || "No notes yet."}</dd>
            </div>
          </dl>
          {customer.sourceLeadId ? (
            <Link className="button secondary-button section-actions" href={`/app/leads/${customer.sourceLeadId}`}>View source lead</Link>
          ) : null}
        </section>

        <section className="panel span-6">
          <h2>Customer portal</h2>
          <p className="muted">Read-only portal for customer-facing estimates, jobs, and invoices. Share manually only after review.</p>
          {customer.portal?.enabled ? (
            <div className="form-stack">
              <label>
                Portal link
                <input readOnly value={customer.portal.url} />
              </label>
              <p className="muted">Last viewed: {customer.portal.lastViewedAt}</p>
              <div className="button-row">
                <Link className="button secondary-button" href={customer.portal.url}>Open portal</Link>
                <form action={disableCustomerPortalAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <button className="button secondary-button" type="submit">Disable portal</button>
                </form>
              </div>
            </div>
          ) : (
            <form action={enableCustomerPortalAction} className="form-stack">
              <input type="hidden" name="customerId" value={customer.id} />
              <p>No active portal link yet.</p>
              <button className="button" type="submit">Create portal link</button>
            </form>
          )}
        </section>

        <ListPanel title="Estimates" rows={customer.estimates.map((row) => ({ id: row.id, title: row.title, meta: row.total, pill: row.status, href: row.href }))} />
        <ListPanel title="Jobs" rows={customer.jobs.map((row) => ({ id: row.id, title: row.title, meta: `${row.schedule} / ${row.nextAction || "No next action"}`, pill: row.status, href: row.href }))} />
        <ListPanel title="Invoices" rows={customer.invoices.map((row) => ({ id: row.id, title: row.title, meta: `${row.total} / due ${row.dueDate}`, pill: row.status, href: row.href }))} />

        <section className="panel span-12">
          <h2>Customer timeline</h2>
          <ul className="timeline-list">
            {customer.timeline.map((item) => (
              <li className="timeline-item" key={item.id}>
                <div>
                  <p className="eyebrow">{item.type}</p>
                  <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
                  <p>{item.body}</p>
                  <p className="muted">{item.occurredAt}</p>
                </div>
                {item.status ? <span className="pill">{item.status}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </QueuePageShell>
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

function ListPanel({ title, rows }: { title: string; rows: { id: string; title: string; meta: string; pill: string; href: string }[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3><Link href={row.href}>{row.title}</Link></h3>
              <p className="muted">{row.meta}</p>
            </div>
            <span className="pill">{row.pill}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
      </ul>
    </section>
  );
}
