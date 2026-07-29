import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import {
  addCustomerTagAction,
  createCustomerAssetAction,
  createCustomerLocationAction,
  createRecurringPlanAction,
  disableCustomerPortalAction,
  enableCustomerPortalAction,
  generateDueMembershipVisitsAction,
  mergeDuplicateCustomerAction
} from "@/app/app/service/actions";
import { getCustomerDetail } from "@/lib/service-ops/get-customer-detail";
import { ContactCommunicationPreferences } from "@/components/preferences/ContactCommunicationPreferences";
import { getContactCommunicationPreference } from "@/lib/preferences/contact-communication-preferences";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const [customer, workspaceId] = await Promise.all([getCustomerDetail(customerId), getCurrentWorkspaceId()]);

  if (!customer) {
    notFound();
  }
  const contactPreference = await getContactCommunicationPreference(workspaceId, `customer:${customer.id}`);

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
          <ContactCommunicationPreferences
            contactKey={`customer:${customer.id}`}
            returnPath={`/app/service/customers/${customer.id}`}
            value={contactPreference}
          />
        </section>

        <section className="panel span-6">
          <h2>Customer portal</h2>
          <p className="muted">One customer link for service requests, messages, estimates, visits, equipment, invoices, payments, memberships, documents, and job proof.</p>
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

        <section className="panel span-6">
          <h2>Locations</h2>
          <ul className="list">
            {customer.locations.map((location) => (
              <li className="list-row" key={location.id}>
                <div><strong>{location.name}{location.primary ? " (primary)" : ""}</strong><p className="muted">{location.type} / {location.address}</p>{location.access ? <p>{location.access}</p> : null}</div>
              </li>
            ))}
          </ul>
          <details className="section-actions">
            <summary>Add another location</summary>
            <form action={createCustomerLocationAction} className="form-stack section-actions">
              <input name="customerId" type="hidden" value={customer.id} />
              <input name="name" placeholder="Home, shop, rental property" required />
              <select name="locationType" defaultValue="service"><option value="service">Service</option><option value="billing">Billing</option><option value="service_and_billing">Service and billing</option><option value="commercial_site">Commercial site</option><option value="other">Other</option></select>
              <input name="addressLine1" placeholder="Street address" />
              <div className="form-grid three"><input name="city" placeholder="City" /><input name="state" placeholder="State" /><input name="postalCode" placeholder="Postal code" /></div>
              <textarea name="accessInstructions" rows={2} placeholder="Gate, parking, access, or arrival instructions" />
              <button className="mini-button" type="submit">Save location</button>
            </form>
          </details>
        </section>

        <section className="panel span-6">
          <h2>Equipment & assets</h2>
          <ul className="list">
            {customer.assets.map((asset) => <li className="list-row" key={asset.id}><div><strong>{asset.name}</strong><p className="muted">{asset.detail} / {asset.warranty}</p></div><span className="pill">{asset.condition}</span></li>)}
            {customer.assets.length === 0 ? <li className="list-row"><span className="muted">No equipment recorded yet.</span></li> : null}
          </ul>
          {customer.locations.length ? (
            <details className="section-actions">
              <summary>Add equipment</summary>
              <form action={createCustomerAssetAction} className="form-stack section-actions">
                <input name="customerId" type="hidden" value={customer.id} />
                <select name="locationId" defaultValue={customer.locations[0]?.id}>{customer.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
                <div className="form-grid two"><input name="name" placeholder="Main furnace" required /><input name="assetType" placeholder="HVAC, roof, vehicle, panel" defaultValue="equipment" /></div>
                <div className="form-grid three"><input name="manufacturer" placeholder="Manufacturer" /><input name="model" placeholder="Model" /><input name="serialNumber" placeholder="Serial number" /></div>
                <div className="form-grid two"><select name="condition" defaultValue="unknown"><option value="unknown">Unknown condition</option><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="failed">Failed</option><option value="retired">Retired</option></select><label>Warranty expires<input name="warrantyExpiresAt" type="date" /></label></div>
                <button className="mini-button" type="submit">Save equipment</button>
              </form>
            </details>
          ) : <p className="muted">Add a service location before adding equipment.</p>}
        </section>

        <section className="panel span-6">
          <h2>Tags</h2>
          <div className="button-row">{customer.tags.map((tag) => <span className="pill" key={tag.id}>{tag.name}</span>)}</div>
          <form action={addCustomerTagAction} className="compact-form section-actions">
            <input name="customerId" type="hidden" value={customer.id} />
            <input name="name" placeholder="VIP, warranty, property manager" required />
            <button className="mini-button" type="submit">Add tag</button>
          </form>
        </section>

        <section className="panel span-6">
          <h2>Possible duplicates</h2>
          <p className="muted">Ferocity only suggests exact email or phone matches. Merging keeps the source record inactive and writes an audit record.</p>
          <ul className="list">
            {customer.duplicateCandidates.map((candidate) => (
              <li className="list-row" key={candidate.id}>
                <div><strong>{candidate.name}</strong><p className="muted">{candidate.reason} / {candidate.status}</p></div>
                <form action={mergeDuplicateCustomerAction} className="compact-form">
                  <input name="targetCustomerId" type="hidden" value={customer.id} />
                  <input name="sourceCustomerId" type="hidden" value={candidate.id} />
                  <input name="confirmation" placeholder="Type MERGE" required pattern="MERGE" />
                  <button className="mini-button danger-button" type="submit">Merge into this customer</button>
                </form>
              </li>
            ))}
            {customer.duplicateCandidates.length === 0 ? <li className="list-row"><span className="muted">No exact email or phone duplicate found.</span></li> : null}
          </ul>
        </section>

        <ListPanel title="Estimates" rows={customer.estimates.map((row) => ({ id: row.id, title: row.title, meta: row.total, pill: row.status, href: row.href }))} />
        <ListPanel title="Jobs" rows={customer.jobs.map((row) => ({ id: row.id, title: row.title, meta: `${row.schedule} / ${row.nextAction || "No next action"}`, pill: row.status, href: row.href }))} />
        <ListPanel title="Invoices" rows={customer.invoices.map((row) => ({ id: row.id, title: row.title, meta: `${row.total} / due ${row.dueDate}`, pill: row.status, href: row.href }))} />

        <section className="panel span-6">
          <h2>Recurring service plans</h2>
          <div className="button-row">
            <Link className="mini-button secondary-button" href="/app/pricebook">Manage membership offers</Link>
            <form action={generateDueMembershipVisitsAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <button className="mini-button" type="submit">Create due visits</button>
            </form>
          </div>
          <ul className="list section-actions">
            {customer.recurringPlans.map((plan) => (
              <li className="list-row" key={plan.id}>
                <div>
                  <h3>{plan.title}</h3>
                  <p className="muted">{plan.frequency} / next {plan.nextServiceDate} / {plan.price}</p>
                  {plan.nextAction ? <p>{plan.nextAction}</p> : null}
                </div>
                <span className="pill">{plan.status}</span>
              </li>
            ))}
            {customer.recurringPlans.length === 0 ? <li className="list-row"><span className="muted">No recurring plans yet.</span></li> : null}
          </ul>
          <form action={createRecurringPlanAction} className="form-stack">
            <input type="hidden" name="customerId" value={customer.id} />
            <label>Membership offer
              <select name="membershipProgramId" defaultValue="">
                <option value="">Custom recurring plan</option>
                {customer.membershipPrograms.map((program) => (
                  <option key={program.id} value={program.id}>{program.name} — {program.price}/{program.frequency}, {program.visitsPerYear} visits/year</option>
                ))}
              </select>
            </label>
            <input name="title" placeholder="Monthly maintenance plan" required />
            <input name="serviceType" placeholder="Service type" />
            <div className="two-col">
              <select name="frequency" defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="custom">Custom</option>
              </select>
              <input name="nextServiceDate" type="date" />
            </div>
            <input name="price" inputMode="decimal" placeholder="Plan price" />
            <textarea name="notes" rows={3} placeholder="Internal plan notes" />
            <button className="button" type="submit">Create recurring plan</button>
          </form>
        </section>

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
