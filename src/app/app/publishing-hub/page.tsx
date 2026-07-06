import Link from "next/link";
import { Code2, FileText, Globe2, MousePointerClick, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPublishingHubDashboard } from "@/lib/publishing-hub/get-publishing-hub";
import { generateSeoAutopilotAction } from "@/app/app/seo/actions";
import { prepareHostedGrowthPagesAction } from "@/app/app/sites/actions";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export default async function PublishingHubPage() {
  const dashboard = await getPublishingHubDashboard();

  return (
    <QueuePageShell
      eyebrow="Website + SEO"
      title="Publishing Hub"
      description="One place to decide where pages live, how leads are captured, what SEO is drafted, and what is allowed to go public."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Simple answer</p>
            <h2>Ferocity can manage SEO work without taking over the whole website.</h2>
            <p className="muted">
              Use the customer website as the main authority when possible. Use Ferocity hosted pages for fast campaign or city/service pages.
              Everything public should stay draft-first until the owner approves publishing.
            </p>
          </div>
          <span className="pill">draft first</span>
        </div>
        <div className="button-row">
          <Link className="button" href="/app/website">Connect Website</Link>
          <Link className="button secondary-button" href="/app/seo">SEO Drafts</Link>
          <Link className="button secondary-button" href="/app/sites">Hosted Pages</Link>
          <Link className="button secondary-button" href="/app/review">Review Drafts</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Active forms" value={dashboard.metrics.activeForms} />
        <Metric label="Hosted pages" value={dashboard.metrics.hostedPages} />
        <Metric label="Published" value={dashboard.metrics.publishedPages} />
        <Metric label="Pages with forms" value={dashboard.metrics.pagesWithForms} />
        <Metric label="SEO drafts" value={dashboard.metrics.seoDrafts} />
        <Metric label="Need review" value={dashboard.metrics.draftsNeedingReview} tone={dashboard.metrics.draftsNeedingReview ? "medium" : ""} />
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
      <small className={`pill ${tone}`}>website + seo</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}
