import Link from "next/link";
import { FileText, Search, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getSeoAutopilotSummary } from "@/lib/seo/seo-autopilot";
import { generateSeoAutopilotAction } from "./actions";

export default async function SeoAutopilotPage() {
  const rows = await getSeoAutopilotSummary();
  const totalKeywords = rows.reduce((sum, row) => sum + row.keywordCount, 0);
  const totalDrafts = rows.reduce((sum, row) => sum + row.recentDraftCount, 0);

  return (
    <QueuePageShell
      eyebrow="SEO Autopilot"
      title="Draft-Only SEO Growth Engine"
      description="Plan topic clusters, service pages, metadata, internal links, and content refreshes from real brand data. Publishing stays manual."
    >
      <div className="grid section-actions">
        <section className="panel span-4 metric">
          <Search size={20} />
          <span className="muted">Keyword seeds</span>
          <strong>{totalKeywords}</strong>
        </section>
        <section className="panel span-4 metric">
          <FileText size={20} />
          <span className="muted">SEO drafts this month</span>
          <strong>{totalDrafts}</strong>
        </section>
        <section className="panel span-4">
          <h2>Autopilot Mode</h2>
          <p className="muted">Drafts and recommendations only. No Search Console, CMS, or publishing connection is active yet.</p>
        </section>
      </div>

      <div className="button-row section-actions">
        <form action={generateSeoAutopilotAction}>
          <button className="button" type="submit">
            <Sparkles size={16} /> Generate SEO drafts
          </button>
        </form>
        <Link className="button secondary-button" href="/app/review">
          <FileText size={16} /> Review drafts
        </Link>
        <Link className="button secondary-button" href="/app/brands">
          Brand SEO data
        </Link>
      </div>

      <div className="grid">
        {rows.map((row) => (
          <section className="panel span-6" key={row.brandId}>
            <div className="list-row flush-row">
              <div>
                <h2>{row.brandName}</h2>
                <p className="muted">
                  {row.keywordCount} keywords / {row.pageCount} pages / {row.recentDraftCount} recent SEO drafts
                </p>
              </div>
              <span className="pill">draft-only</span>
            </div>
            <h3>Top keywords</h3>
            <div className="button-row section-actions">
              {(row.topKeywords.length > 0 ? row.topKeywords : ["Add keyword seeds in Brand SEO data"]).map((keyword) => (
                <span className="pill" key={keyword}>
                  {keyword}
                </span>
              ))}
            </div>
            <h3>Next topics</h3>
            <ul className="list">
              {row.nextTopics.map((topic) => (
                <li className="list-row" key={topic}>
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {rows.length === 0 ? (
          <section className="panel span-12">
            <h2>No active brands yet</h2>
            <p className="muted">Create a workspace brand before generating SEO autopilot drafts.</p>
          </section>
        ) : null}
      </div>
    </QueuePageShell>
  );
}
