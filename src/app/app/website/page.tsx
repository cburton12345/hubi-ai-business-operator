import Link from "next/link";
import { Code2, ExternalLink, FileText, MousePointerClick, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPublicFormRows } from "@/lib/forms/get-public-forms";
import { getHostedGrowthPages } from "@/lib/sites/hosted-growth-pages";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";

function firstFormUrl(publicKey: string) {
  return `${appUrl}/forms/${publicKey}`;
}

export default async function WebsiteConnectorPage() {
  const [forms, hostedPages] = await Promise.all([getPublicFormRows(), getHostedGrowthPages()]);
  const activeForms = forms.filter((form) => form.active);
  const primaryForm = activeForms[0] ?? forms[0];
  const formUrl = primaryForm ? firstFormUrl(primaryForm.publicKey) : `${appUrl}/forms/YOUR_FORM_KEY`;
  const trackedFormUrl = `${formUrl}?utm_source=website&utm_medium=button&utm_campaign=request_quote`;
  const connectedHostedPages = hostedPages.filter((page) => page.formPublicKey).length;

  return (
    <QueuePageShell
      eyebrow="Website Connector"
      title="Connect A Business Website"
      description="Use the customer's own website as the main SEO home, while Ferocity captures leads, source data, follow-up work, drafts, and revenue attribution."
    >
      <div className="grid section-actions">
        <section className="panel span-4 metric">
          <span className="muted">Active lead forms</span>
          <strong>{activeForms.length}</strong>
        </section>
        <section className="panel span-4 metric">
          <span className="muted">Hosted growth pages</span>
          <strong>{hostedPages.length}</strong>
        </section>
        <section className="panel span-4 metric">
          <span className="muted">Pages with forms</span>
          <strong>{connectedHostedPages}</strong>
        </section>
      </div>

      <div className="button-row section-actions">
        <Link className="button" href="/app/forms">
          <MousePointerClick size={16} /> Lead forms
        </Link>
        <Link className="button secondary-button" href="/app/seo">
          <FileText size={16} /> SEO drafts
        </Link>
        <Link className="button secondary-button" href="/app/sites">
          Hosted pages
        </Link>
        <Link className="button secondary-button" href="/app/build-system">
          Build My System
        </Link>
      </div>

      <div className="grid section-actions">
        <section className="panel span-6">
          <h2>How A Website Connects</h2>
          <ul className="list">
            {[
              ["Add a Ferocity form", "Put a quote button, contact link, or embedded form on the customer's website."],
              ["Carry source data", "UTM source, campaign, page URL, and referrer stay attached to the lead."],
              ["Review before action", "Follow-up, review requests, SEO drafts, and publishing stay controlled by approvals."],
              ["Tie marketing to revenue", "Leads can move into estimates, jobs, invoices, reviews, and reporting."]
            ].map(([title, body]) => (
              <li className="list-row" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
                <span className="pill">setup step</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Where SEO Content Lives</h2>
          <ul className="list">
            {[
              ["Customer website", "Best for long-term authority, service pages, city pages, blog posts, and conversion pages."],
              ["Ferocity hosted pages", "Useful for quick campaign pages, businesses without a site, or testing a service area."],
              ["Google Business and social", "Good for shorter updates, review activity, offers, photos, and reminders."],
              ["Manual export or CMS connection", "WordPress, Webflow, Shopify, Netlify, or a developer workflow can publish approved drafts."]
            ].map(([title, body]) => (
              <li className="list-row" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
                <span className="pill">reviewed</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel section-actions">
        <h2>
          <Code2 size={18} /> What To Add To The Website
        </h2>
        <p className="muted">
          These snippets connect the site to Ferocity lead capture and attribution. Replace the form key only if you rotate or create another form.
        </p>

        <div className="grid section-actions">
          <div className="span-6">
            <h3>Quote button</h3>
            <pre className="json-block">{`<a href="${trackedFormUrl}">Request a quote</a>`}</pre>
          </div>
          <div className="span-6">
            <h3>Embedded form</h3>
            <pre className="json-block">{`<iframe
  src="${trackedFormUrl}"
  title="Request a quote"
  loading="lazy"
></iframe>`}</pre>
          </div>
          <div className="span-12">
            <h3>Source tracking helper</h3>
            <p className="muted">
              Add this once. It appends UTM, page URL, and referrer data to Ferocity form links and embeds on the page.
            </p>
            <pre className="json-block">{`<script src="${appUrl}/ferocity.js" defer></script>`}</pre>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <ShieldCheck size={18} /> Safe Defaults
            </h2>
            <p className="muted">Ferocity can prepare the work, but public actions stay controlled.</p>
          </div>
          <span className="pill">approval first</span>
        </div>
        <ul className="plain-list">
          <li>SEO and marketing drafts can be exported or published only through an approved connection.</li>
          <li>Email, SMS, review requests, paid ads, and provider sync stay behind permissions and service controls.</li>
          <li>Lead source, campaign, page, service, city, estimate, job, invoice, review, and revenue data stay part of the same loop.</li>
          <li>Power users can keep using direct settings, forms, integrations, SEO, growth pages, and reports.</li>
        </ul>
      </section>

      {primaryForm ? (
        <section className="panel section-actions">
          <h2>Current Form</h2>
          <div className="list-row">
            <div>
              <h3>{primaryForm.name}</h3>
              <p className="muted">
                {primaryForm.brandName} / {primaryForm.publicKey}
              </p>
            </div>
            <Link className="mini-button" href={formUrl}>
              <ExternalLink size={14} /> Open
            </Link>
          </div>
        </section>
      ) : null}
    </QueuePageShell>
  );
}
