import Link from "next/link";
import { CheckCircle2, Code2, ExternalLink, FileText, MousePointerClick, ShieldCheck } from "lucide-react";
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
  const formKey = primaryForm?.publicKey ?? "YOUR_FORM_KEY";
  const oneLineSnippet = `<script src="${appUrl}/ferocity.js" data-form-key="${formKey}" data-mode="floating" data-button-label="Request a quote" defer></script>`;
  const inlineSnippet = `<div id="ferocity-quote"></div>
<script
  src="${appUrl}/ferocity.js"
  data-form-key="${formKey}"
  data-target="#ferocity-quote"
  data-button-label="Request a quote"
  defer
></script>`;
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
        <Link className="button" href="/app/publishing-hub">
          Publishing Hub
        </Link>
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
          Let Ferocity Set This Up
        </Link>
        <Link className="button secondary-button" href="/app/marketing-os">
          Marketing
        </Link>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Easiest path</p>
            <h2>One line can add a tracked quote button.</h2>
            <p className="muted">
              Put this before the closing body tag or in the site builder&apos;s custom code area. It adds a floating quote button,
              opens the Ferocity form, and keeps source, campaign, page, and referrer data attached.
            </p>
          </div>
          <span className="pill">copy this</span>
        </div>
        <pre className="json-block">{oneLineSnippet}</pre>
        <div className="button-row section-actions">
          <a className="button" href={trackedFormUrl} target="_blank" rel="noreferrer">
            Test form <ExternalLink size={16} />
          </a>
          <Link className="button secondary-button" href="/app/forms">
            Choose form
          </Link>
          <Link className="button secondary-button" href="/app/marketing-os">
            Import website
          </Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Guided setup</p>
            <h2>Once the website is connected, Ferocity starts building the operating loop.</h2>
            <p className="muted">
              The simple path is capture first, then tracking, then growth drafts, follow-up, reviews, and attribution. Owners should not have to understand APIs.
            </p>
          </div>
          <span className="pill">plain steps</span>
        </div>
        <div className="grid section-actions">
          {[
            ["1", "Paste the website URL", "Ferocity reads the public site and finds services, service areas, contact gaps, and likely conversion issues."],
            ["2", "Add the one-line script", "The quote button and source tracking start working without rebuilding the website."],
            ["3", "Test one lead", "Submit the form once and confirm it lands in Leads with page and campaign details."],
            ["4", "Let AI build the growth plan", "Prepare service pages, city pages, GBP posts, review asks, campaigns, and follow-up from the business instructions."],
            ["5", "Turn on the right autopilot mode", "Owner Shield, Growth Engine, or Manual First controls what Ferocity watches, drafts, queues, and escalates."],
            ["6", "Choose publishing path", "Keep drafts in Ferocity, export to the customer website, use hosted pages, or connect a CMS when credentials are ready."]
          ].map(([number, title, body]) => (
            <article className="panel span-4" key={title}>
              <span className="pill">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid section-actions">
        <section className="panel span-6">
          <h2>How A Website Connects</h2>
          <ul className="list">
            {[
              ["Add a Ferocity form", "Put a quote button, contact link, or embedded form on the customer's website."],
              ["Carry source data", "UTM source, campaign, page URL, and referrer stay attached to the lead."],
              ["Use the AI rules", "The brand's AI instructions guide replies, follow-up timing, growth priorities, and escalation rules."],
              ["Review before action", "Follow-up, review requests, SEO drafts, and publishing stay controlled by approvals and autopilot mode."],
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
            <h3>Inline quote button</h3>
            <pre className="json-block">{inlineSnippet}</pre>
          </div>
          <div className="span-6">
            <h3>Quote button</h3>
            <pre className="json-block">{`<a href="${trackedFormUrl}">Request a quote</a>`}</pre>
          </div>
          <div className="span-12">
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
            <h2>Where do I paste this?</h2>
            <p className="muted">The owner version should be this simple. Paste once, then test one lead.</p>
          </div>
          <CheckCircle2 size={22} />
        </div>
        <div className="grid">
          {[
            ["WordPress", "Appearance or plugin custom code area, before </body>."],
            ["Wix / Squarespace / GoDaddy", "Settings or custom code injection, footer/body end."],
            ["Shopify", "theme.liquid before </body> or a custom app/embed area."],
            ["Webflow", "Page settings or project custom code, before </body>."],
            ["Netlify / custom site", "Add the snippet to the layout or HTML template before </body>."],
            ["Not sure", "Send this page to the website person. They only need the snippet and form test link."]
          ].map(([title, body]) => (
            <article className="panel span-4" key={title}>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
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
          <span className="pill">review before public changes</span>
        </div>
        <ul className="plain-list">
          <li>SEO and marketing drafts can be exported or published only through an approved connection.</li>
          <li>Email, review requests, paid ads, and provider sync stay behind permissions and service controls.</li>
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
