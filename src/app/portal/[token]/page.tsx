import { notFound } from "next/navigation";
import { ProofCaptureShell } from "@/app/proof/[token]/page";
import { getCustomerPortal } from "@/lib/service-ops/get-customer-portal";
import { getPortalProofContext } from "@/lib/ugc/proof";
import { createPortalRequestAction, sendPortalMessageAction } from "./actions";

export default async function CustomerPortalPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ proof?: string; error?: string; success?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const [portal, proofContext] = await Promise.all([getCustomerPortal(token), getPortalProofContext(token)]);

  if (!portal) {
    notFound();
  }

  if (query.proof === "1" && proofContext) {
    return (
      <ProofCaptureShell
        cityState={proofContext.location}
        customerEmail={proofContext.customerEmail}
        customerName={proofContext.customerName}
        customerPhone={proofContext.customerPhone}
        error={query.error}
        jobTitle={proofContext.jobTitle}
        mode="portal"
        organizationName={proofContext.organizationName}
        success={query.success === "1"}
        token={token}
      />
    );
  }

  return (
    <main className="public-page">
      <section className="public-shell">
        <p className="eyebrow">{portal.organizationName}</p>
        <h1>{portal.customerName}</h1>
        <p className="muted">
          Request service, review estimates, see upcoming visits, pay prepared invoices, and keep your service history in one place.
        </p>
        {query.success ? <div className="success-card">Thank you. Your {query.success === "message" ? "message" : "request"} was sent.</div> : null}
        {query.error ? <div className="warning-card">That request could not be completed. Refresh this page or contact the business.</div> : null}
        <div className="button-row">
          <a className="button" href={`/portal/${token}?proof=1`}>
            Share job photos or testimonial
          </a>
        </div>

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
              status: estimate.status,
              url: estimate.url
            }))}
          />
          <PortalList
            title="Upcoming & recent visits"
            empty="No visits scheduled yet."
            rows={portal.visits.map((visit) => ({
              id: visit.id,
              title: visit.title,
              meta: `${visit.schedule} / ${visit.address}`,
              status: visit.status
            }))}
          />
          <PortalList
            title="Invoices"
            empty="No shared invoices yet."
            rows={portal.invoices.map((invoice) => ({
              id: invoice.id,
              title: invoice.title,
              meta: `${invoice.total} / paid ${invoice.amountPaid} / due ${invoice.dueDate}`,
              status: invoice.status,
              url: invoice.paymentUrl,
              actionLabel: invoice.paymentUrl ? "Pay securely" : ""
            }))}
          />
          <PortalList
            title="Recurring Plans"
            empty="No active recurring plans yet."
            rows={portal.recurringPlans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              meta: `${plan.price} ${plan.frequency} / next visit ${plan.nextServiceDate} / renews ${plan.renewal}`,
              status: "active"
            }))}
          />
          <PortalList
            title="Equipment"
            empty="No equipment is on file yet."
            rows={portal.assets.map((asset) => ({
              id: asset.id,
              title: asset.name,
              meta: `${asset.detail} / ${asset.warranty}`,
              status: "on file"
            }))}
          />
          <PortalList
            title="Documents"
            empty="No customer documents have been shared."
            rows={portal.documents.map((document) => ({
              id: document.id,
              title: document.title,
              meta: `${document.type} / ${document.createdAt}`,
              status: "available",
              url: document.url,
              actionLabel: document.url ? "Open" : ""
            }))}
          />
          <PortalList
            title="Your requests"
            empty="No requests yet."
            rows={portal.requests.map((request) => ({
              id: request.id,
              title: request.subject,
              meta: `${request.type} / ${request.createdAt}${request.details ? ` / ${request.details}` : ""}`,
              status: request.status
            }))}
          />
          <section className="panel span-6 form-stack">
            <h2>Request service or a change</h2>
            <p className="muted">Tell the office what you need. A preferred time is a request, not a confirmed appointment.</p>
            <form action={createPortalRequestAction} className="form-stack">
              <input name="token" type="hidden" value={token} />
              <label>Request type
                <select name="requestType" defaultValue="service">
                  <option value="service">Request service</option>
                  <option value="reschedule">Reschedule a visit</option>
                  <option value="cancel">Cancel a visit</option>
                  <option value="estimate_change">Change an estimate</option>
                  <option value="billing">Billing question</option>
                  <option value="document">Request a document</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label>Subject<input name="subject" required maxLength={180} /></label>
              <label>Details<textarea name="details" rows={4} maxLength={3000} /></label>
              <label>Preferred date and time<input name="preferredStart" type="datetime-local" /></label>
              <button className="button" type="submit">Send request</button>
            </form>
          </section>
          <section className="panel span-6 form-stack">
            <h2>Message the office</h2>
            <form action={sendPortalMessageAction} className="form-stack">
              <input name="token" type="hidden" value={token} />
              <label>Message<textarea name="body" rows={4} required maxLength={3000} /></label>
              <button className="button secondary-button" type="submit">Send message</button>
            </form>
            <ul className="list">
              {portal.messages.map((message) => (
                <li className="list-row" key={message.id}>
                  <div><strong>{message.direction === "customer" ? "You" : portal.organizationName}</strong><p>{message.body}</p><p className="muted">{message.createdAt}</p></div>
                </li>
              ))}
              {portal.messages.length === 0 ? <li className="list-row"><span className="muted">No portal messages yet.</span></li> : null}
            </ul>
          </section>
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
  rows: { id: string; title: string; meta: string; status: string; url?: string; actionLabel?: string }[];
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
            <div className="inline-actions">
              <span className="pill">{row.status}</span>
              {row.url ? <a className="mini-button" href={row.url}>{row.actionLabel || "Review"}</a> : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
