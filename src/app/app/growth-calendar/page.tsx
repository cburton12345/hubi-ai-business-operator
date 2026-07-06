import Link from "next/link";
import { BarChart3, CalendarDays, FileText, ImagePlus, Megaphone, Search, Star, Wand2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getGrowthCalendarDashboard } from "@/lib/growth-calendar/get-growth-calendar-dashboard";

const metricLabels = [
  ["seoDrafts", "SEO drafts"],
  ["publishingItems", "Publishing work"],
  ["reviewRequests", "Review asks"],
  ["proofNeedsReview", "Proof to check"],
  ["campaigns", "Campaigns"],
  ["websiteImports", "Website reads"],
  ["mediaAssets", "Media assets"],
  ["graphicVideoJobs", "Graphic/video jobs"]
] as const;

const streamIcons = [Search, ImagePlus, CalendarDays, Megaphone, Star, BarChart3];

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export default async function GrowthCalendarPage() {
  const dashboard = await getGrowthCalendarDashboard();

  return (
    <QueuePageShell
      eyebrow="Growth Calendar"
      title="This Week's Marketing Work"
      description="One place to see SEO, reviews, customer proof, website work, campaigns, drafts, publishing, and ROI tracking."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Plain-English growth board</p>
            <h2>Know what to work on next without hunting through every tool.</h2>
            <p className="muted">
              Ferocity still keeps the full SEO, proof, review, publishing, and marketing tools. This page simply turns those pieces into a weekly work list.
            </p>
          </div>
          <Link className="button" href="/app/marketing-os">
            <Wand2 size={16} /> Have AI Plan It
          </Link>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/publishing-hub">Publishing Hub</Link>
          <Link className="button secondary-button" href="/app/seo">SEO</Link>
          <Link className="button secondary-button" href="/app/proof">Customer Proof</Link>
          <Link className="button secondary-button" href="/app/review">Reviews</Link>
          <Link className="button secondary-button" href="/app/calendar">Calendar</Link>
          <Link className="button secondary-button" href="/app/reports">Reports</Link>
        </div>
      </section>

      <section className="grid section-actions">
        {metricLabels.map(([key, label]) => (
          <section className="metric-card span-3" key={key}>
            <small className="pill">growth</small>
            <strong>{dashboard.metrics[key]}</strong>
            <span>{label}</span>
          </section>
        ))}
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Next Growth Moves</h2>
          <p className="muted">Ranked by what is most likely to unblock leads, trust, publishing, or tracking.</p>
          <ul className="list">
            {dashboard.actions.map((action) => (
              <li className="list-row" key={action.title}>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${action.urgency}`}>{action.urgency}</span>
                  <Link className="mini-button" href={action.href}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-7">
          <h2>Growth Workstreams</h2>
          <p className="muted">The major buckets stay simple even when the full system is deep.</p>
          <div className="path-grid">
            {dashboard.workstreams.map((stream, index) => {
              const Icon = streamIcons[index] ?? FileText;
              return (
                <Link className="path-card" href={stream.href} key={stream.title}>
                  <Icon size={18} />
                  <strong>{stream.title}</strong>
                  <span>{stream.plainGoal}</span>
                  <span className="pill">{stream.count} / {stream.status}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Recent Drafts</h2>
              <p className="muted">SEO, GBP, social, service, city, and landing page drafts waiting for review or use.</p>
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
                  <p className="muted">Create SEO drafts, collect proof, or ask Marketing to prepare campaign content.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Campaign And Website Inputs</h2>
              <p className="muted">Use real business, website, media, and campaign context so growth work does not sound generic.</p>
            </div>
            <Link className="mini-button" href="/app/marketing-os">Open Marketing</Link>
          </div>
          <ul className="list">
            {[...dashboard.websiteImports, ...dashboard.campaigns, ...dashboard.outputs].slice(0, 8).map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.meta}</p>
                  {item.detail ? <p>{item.detail}</p> : null}
                </div>
                <span className="pill">{item.status}</span>
              </li>
            ))}
            {dashboard.websiteImports.length + dashboard.campaigns.length + dashboard.outputs.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No campaign inputs yet</h3>
                  <p className="muted">Import a website, create a business profile, or start a campaign blueprint.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}
