import Link from "next/link";
import { Code2, ExternalLink, FileText, Globe2, MousePointerClick, ReceiptText, ShieldCheck, Star } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getCustomerTouchpointsDashboard, type TouchpointRow } from "@/lib/customer-touchpoints/get-customer-touchpoints-dashboard";

function pillTone(status: string) {
  if (["expired", "failed", "needs setup"].includes(status)) return "high";
  if (["draft", "review", "ready", "sent_manually"].includes(status)) return "medium";
  return "";
}

function publicFormUrl(appUrl: string, publicKey: string) {
  return `${appUrl}/forms/${publicKey}`;
}

export default async function CustomerTouchpointsPage() {
  const dashboard = await getCustomerTouchpointsDashboard();
  const primaryForm = dashboard.forms.find((form) => form.active) ?? dashboard.forms[0];
  const formUrl = primaryForm ? publicFormUrl(dashboard.appUrl, primaryForm.publicKey) : `${dashboard.appUrl}/forms/YOUR_FORM_KEY`;
  const trackedFormUrl = `${formUrl}?utm_source=website&utm_medium=button&utm_campaign=request_quote`;

  return (
    <QueuePageShell
      eyebrow="Customer Touchpoints"
      title="Every Public Link And Website Hookup"
      description="One place for forms, website snippets, hosted pages, customer portals, proof links, payment-link readiness, grader reports, and public onboarding paths."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Outside-facing setup</p>
            <h2>Show exactly how Ferocity touches customers and websites.</h2>
            <p className="muted">
              Private workspace pages stay private. These are the public or customer-facing paths a business can share, embed, or connect.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/website">
              <Globe2 size={16} /> Website Connector
            </Link>
            <Link className="button secondary-button" href="/app/forms">
              Lead Forms
            </Link>
          </div>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/sites">Hosted Pages</Link>
          <Link className="button secondary-button" href="/app/proof">Proof Links</Link>
          <Link className="button secondary-button" href="/app/cash-collection">Payment Readiness</Link>
          <Link className="button secondary-button" href="/app/website-grader">Business Grader</Link>
          <Link className="button secondary-button" href="/app/safety-readiness">Safety</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Active forms" value={dashboard.metrics.publicForms} />
        <Metric label="Hosted pages" value={dashboard.metrics.hostedPages} />
        <Metric label="Published pages" value={dashboard.metrics.publishedPages} />
        <Metric label="Portal links" value={dashboard.metrics.portalLinks} />
        <Metric label="Proof links" value={dashboard.metrics.proofLinks} />
        <Metric label="Payment links" value={dashboard.metrics.paymentLinks} />
        <Metric label="Grader reports" value={dashboard.metrics.graderReports} />
        <Metric label="Access requests" value={dashboard.metrics.accessRequests} />
        <Metric label="Worker intake" value={dashboard.metrics.workerIntake} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Setup Order</h2>
          <p className="muted">The simple path for getting a business connected without burying them in settings.</p>
          <ul className="list">
            {dashboard.setupSteps.map((step, index) => (
              <li className="list-row" key={step.title}>
                <div>
                  <h3>{index + 1}. {step.title}</h3>
                  <p className="muted">{step.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${pillTone(step.status)}`}>{step.status}</span>
                  <Link className="mini-button" href={step.href}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-7">
          <h2><Code2 size={18} /> Website Snippets</h2>
          <p className="muted">Add a quote path first. The tracking helper keeps UTM, page URL, and referrer data attached to Ferocity forms.</p>
          <div className="grid">
            <div className="span-6">
              <h3>Quote button</h3>
              <pre className="json-block">{`<a href="${trackedFormUrl}">Request a quote</a>`}</pre>
            </div>
            <div className="span-6">
              <h3>Embedded form</h3>
              <pre className="json-block">{`<iframe src="${trackedFormUrl}" title="Request a quote"></iframe>`}</pre>
            </div>
            <div className="span-12">
              <h3>Tracking helper</h3>
              <pre className="json-block">{`<script src="${dashboard.appUrl}/ferocity.js" defer></script>`}</pre>
            </div>
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2><MousePointerClick size={18} /> Lead Capture</h2>
              <p className="muted">Forms and hosted pages that can create tracked leads.</p>
            </div>
            <Link className="mini-button" href="/app/forms">Manage forms</Link>
          </div>
          <ul className="list">
            {dashboard.forms.map((form) => (
              <li className="list-row" key={form.id}>
                <div>
                  <h3>{form.name}</h3>
                  <p className="muted">{form.brandName} / {form.publicKey}</p>
                  <a className="inline-link" href={publicFormUrl(dashboard.appUrl, form.publicKey)} target="_blank">Open public form</a>
                </div>
                <span className={`pill ${form.active ? "" : "high"}`}>{form.active ? "active" : "paused"}</span>
              </li>
            ))}
            {dashboard.forms.length === 0 ? <li className="list-row"><span className="muted">No public forms yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2><FileText size={18} /> Hosted Pages</h2>
              <p className="muted">Ferocity-hosted growth pages connected to lead capture and attribution.</p>
            </div>
            <Link className="mini-button" href="/app/sites">Manage pages</Link>
          </div>
          <ul className="list">
            {dashboard.pages.map((page) => (
              <li className="list-row" key={page.id}>
                <div>
                  <h3>{page.title}</h3>
                  <p className="muted">{page.brandName} / {page.pageType} / {page.primaryKeyword ?? "no keyword"}</p>
                  {page.status === "published" ? <Link className="inline-link" href={page.publicUrl}>Open page</Link> : <span className="muted">Publish to enable public URL</span>}
                </div>
                <span className={`pill ${pillTone(page.status)}`}>{page.status}</span>
              </li>
            ))}
            {dashboard.pages.length === 0 ? <li className="list-row"><span className="muted">No hosted pages yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <TouchpointList title="Customer Portal Links" icon={<ShieldCheck size={18} />} rows={dashboard.portalLinks} empty="No customer portal links yet." />
        <TouchpointList title="Proof And Review Links" icon={<Star size={18} />} rows={dashboard.proofLinks} empty="No proof links yet." />
        <TouchpointList title="Payment Links" icon={<ReceiptText size={18} />} rows={dashboard.paymentLinks} empty="No payment links prepared yet." />
        <TouchpointList title="Public Growth Paths" icon={<Globe2 size={18} />} rows={dashboard.publicGrowth} empty="No public growth paths found." />
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="metric-card span-3">
      <small className="pill">public</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

function TouchpointList({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; rows: TouchpointRow[]; empty: string }) {
  return (
    <section className="panel span-6">
      <h2>{icon} {title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              <p className="muted">{row.detail}</p>
              <div className="inline-actions">
                <Link className="inline-link" href={row.href}>Manage</Link>
                {row.publicHref ? (
                  <a className="inline-link" href={row.publicHref} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Open public
                  </a>
                ) : null}
              </div>
            </div>
            <span className={`pill ${pillTone(row.status)}`}>{row.status}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}
