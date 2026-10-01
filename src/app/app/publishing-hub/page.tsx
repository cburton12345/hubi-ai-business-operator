import Link from "next/link";
import { Code2, FileText, Globe2, MousePointerClick, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPublishingHubDashboard } from "@/lib/publishing-hub/get-publishing-hub";
import { generateSeoAutopilotAction } from "@/app/app/seo/actions";
import { prepareHostedGrowthPagesAction } from "@/app/app/sites/actions";
import { createCanonicalDistributionAction } from "./actions";

const destinationChoices = [
  ["website", "Website"],
  ["google_business_profile", "Google Business Profile"],
  ["apple_business_connect", "Apple Business Connect"],
  ["bing_places", "Bing Places"],
  ["directory_sync", "Business directories"],
  ["zillow_network", "Zillow rental network"],
  ["apartments_feed", "Apartments.com renter network"],
  ["tenantcloud", "TenantCloud"],
  ["turbotenant", "TurboTenant"],
  ["review_platform", "Review platforms"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok content"],
  ["linkedin", "LinkedIn"],
  ["google_ads", "Google Ads"],
  ["meta_ads", "Meta Ads"],
  ["tiktok_ads", "TikTok Ads"],
  ["microsoft_ads", "Microsoft Ads"],
  ["email", "Email"],
  ["sms", "SMS"],
  ["reddit", "Reddit"],
  ["nextdoor", "Nextdoor"]
] as const;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export default async function PublishingHubPage() {
  const dashboard = await getPublishingHubDashboard();

  return (
    <QueuePageShell
      eyebrow="Create once · distribute with control"
      title="Publishing Hub"
      description="Create the business message once. Ferocity adapts it for each eligible destination, keeps provider rules and approvals visible, and tracks what produces leads and revenue."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">One source · channel-specific execution</p>
            <h2>Choose the outcome and destinations. Ferocity handles the translation.</h2>
            <p className="muted">
              A post, offer, ad, listing, email, text, or page stays one canonical piece of work. Every destination gets its own preview,
              format, connection status, approval, delivery result, replies, and attribution. Paid spend is never inferred from autopilot.
            </p>
          </div>
          <span className="pill">provider neutral</span>
        </div>
        <div className="button-row">
          <Link className="button" href="/app/website">Connect Website</Link>
          <Link className="button secondary-button" href="/app/seo">SEO Drafts</Link>
          <Link className="button secondary-button" href="/app/sites">Hosted Pages</Link>
          <Link className="button secondary-button" href="/app/review">Review Drafts</Link>
        </div>
      </section>

      <form action={createCanonicalDistributionAction} className="panel form-stack section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Create once</p>
            <h2>Prepare a distribution package</h2>
            <p className="muted">This creates destination plans and previews. Provider-controlled steps and spend remain gated.</p>
          </div>
          <span className="pill">approval required</span>
        </div>
        <label>
          What are you creating?
          <select name="publicationType" defaultValue="organic_post">
            <option value="organic_post">Organic post</option>
            <option value="paid_ad">Paid ad</option>
            <option value="listing">Listing</option>
            <option value="promotion">Promotion</option>
            <option value="job_post">Job post</option>
            <option value="service_offer">Service offer</option>
            <option value="email_campaign">Email campaign</option>
            <option value="sms_campaign">SMS campaign</option>
            <option value="webpage">Web page</option>
          </select>
        </label>
        <label>
          Title
          <input name="title" required minLength={3} maxLength={180} placeholder="Spring service offer" />
        </label>
        <label>
          Message or brief
          <textarea name="body" required minLength={10} rows={5} placeholder="Explain the offer, audience, proof, and desired next step. Ferocity will adapt it by channel." />
        </label>
        <div className="grid">
          <label className="span-6">
            Call-to-action label
            <input name="ctaLabel" maxLength={80} placeholder="Book now" />
          </label>
          <label className="span-6">
            Call-to-action URL
            <input name="ctaUrl" type="url" placeholder="https://example.com/book" />
          </label>
          <label className="span-6">
            Schedule (optional)
            <input name="publishAt" type="datetime-local" />
          </label>
          <label className="span-6">
            Total paid budget (optional)
            <input name="totalBudgetDollars" type="number" min="0" step="0.01" placeholder="0.00" />
          </label>
        </div>
        <fieldset className="form-stack">
          <legend>Destinations</legend>
          <label className="checkbox-row">
            <input name="publishEverywhere" type="checkbox" /> Everywhere appropriate for this type
          </label>
          <div className="grid">
            {destinationChoices.map(([key, label]) => (
              <label className="checkbox-row span-3" key={key}>
                <input name="destinations" type="checkbox" value={key} /> {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="checkbox-row">
          <input name="explicitSpendApproved" type="checkbox" /> I explicitly approve the stated paid-media budget (required only for paid destinations)
        </label>
        <div className="button-row">
          <button className="button" type="submit">Prepare previews and destination plans</button>
          <span className="muted">Preparing is not the same as publishing.</span>
        </div>
      </form>

      <section className="grid section-actions">
        <Metric label="Canonical items" value={dashboard.metrics.canonicalPublications} />
        <Metric label="Destination plans" value={dashboard.metrics.destinationPlans} />
        <Metric label="Need attention" value={dashboard.metrics.destinationsNeedingAttention} tone={dashboard.metrics.destinationsNeedingAttention ? "medium" : ""} />
        <Metric label="Active forms" value={dashboard.metrics.activeForms} />
        <Metric label="Hosted pages" value={dashboard.metrics.hostedPages} />
        <Metric label="SEO drafts" value={dashboard.metrics.seoDrafts} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Distribution status</h2>
            <p className="muted">Every destination reports independently. A failure on one channel does not hide success or block recovery on another.</p>
          </div>
          <span className="pill">delivery truth</span>
        </div>
        <ul className="list">
          {dashboard.recentDistributions.map((item) => (
            <li className="list-row" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">
                  {item.publicationType.replaceAll("_", " ")} · {item.destinations} destinations · {item.succeeded} succeeded · {item.needsAttention} need attention · {dateLabel(item.createdAt)}
                </p>
              </div>
              <span className="pill">{item.status.replaceAll("_", " ")}</span>
            </li>
          ))}
          {dashboard.recentDistributions.length === 0 ? (
            <li className="list-row"><div><h3>No distribution packages yet</h3><p className="muted">Create one above; Ferocity will show the truthful status for each destination.</p></div></li>
          ) : null}
        </ul>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>
            <Globe2 size={18} /> Pick Where The Page Lives
          </h2>
          <ul className="list">
            {[
              ["Customer website", "Best for long-term SEO authority, main services, city pages, blogs, and trust pages.", "/app/website"],
              ["Ferocity hosted page", "Best for fast campaign pages, new service areas, businesses without a site, or proof-of-concept pages.", "/app/sites"],
              ["Google Business / social", "Best for updates, photos, review proof, offers, and weekly activity.", "/app/marketing-os"],
              ["Manual export / CMS connection", "Best when a developer, WordPress, Webflow, Shopify, or Netlify workflow needs approved copy.", "/app/exports"]
            ].map(([title, body, href]) => (
              <li className="list-row" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
                <Link className="mini-button" href={href}>Open</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>
            <ShieldCheck size={18} /> Publishing Rules
          </h2>
          <ul className="list">
            {[
              ["Draft", "AI can prepare content, pages, posts, and page updates."],
              ["Review", "A human checks facts, tone, claims, service areas, and calls to action."],
              ["Approve", "Owner or admin decides what can go public."],
              ["Publish", "Only approved CMS, hosted page, social, GBP, email, or manual export paths go live."],
              ["Track", "Every lead keeps source, page, campaign, service, city, and revenue context."]
            ].map(([title, body]) => (
              <li className="list-row" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </div>
                <span className="pill">safe</span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>
            <Sparkles size={18} /> Prepare Work
          </h2>
          <p className="muted">These create or refresh draft work. They do not publish to a live website by themselves.</p>
          <div className="button-row">
            <form action={generateSeoAutopilotAction}>
              <button className="button" type="submit">
                <PenLine size={16} /> Generate SEO Drafts
              </button>
            </form>
            <form action={prepareHostedGrowthPagesAction}>
              <button className="button secondary-button" type="submit">
                <FileText size={16} /> Prepare Hosted Pages
              </button>
            </form>
          </div>
        </section>

        <section className="panel span-6">
          <h2>
            <MousePointerClick size={18} /> Lead Capture
          </h2>
          <p className="muted">Use this link or the script on the customer website so Ferocity can track source and follow-up.</p>
          <pre className="json-block">{`<a href="${dashboard.trackedFormUrl}">Request a quote</a>`}</pre>
          <pre className="json-block">{`<script src="${process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live"}/ferocity.js" defer></script>`}</pre>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Code2 size={18} /> Current Drafts
            </h2>
            <p className="muted">Recent SEO or marketing drafts that may become website pages, hosted pages, GBP posts, or exported copy.</p>
          </div>
          <Link className="mini-button" href="/app/review">Review all</Link>
        </div>
        <ul className="list">
          {dashboard.drafts.map((draft) => (
            <li className="list-row" key={draft.id}>
              <div>
                <h3>{draft.title}</h3>
                <p className="muted">
                  {draft.contentType.replaceAll("_", " ")} / {draft.status.replaceAll("_", " ")} / {dateLabel(draft.createdAt)}
                </p>
              </div>
              <span className="pill">{draft.riskLevel}</span>
            </li>
          ))}
          {dashboard.drafts.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No drafts yet</h3>
                <p className="muted">Generate SEO drafts or have the AI Workforce prepare website and marketing work.</p>
              </div>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${tone}`}>distribution</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
