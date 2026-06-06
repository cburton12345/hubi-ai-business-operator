import Link from "next/link";
import { Gauge, Globe2 } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getWebsiteGraderReports, type WebsiteGraderReportRow } from "@/lib/website-grader/get-website-grader-reports";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AppWebsiteGraderPage({
  searchParams
}: {
  searchParams: Promise<{ industry?: string; state?: string; scoreRange?: string }>;
}) {
  const params = await searchParams;
  const { rows, stats } = await getWebsiteGraderReports({
    industry: params.industry || undefined,
    state: params.state || undefined,
    scoreRange: params.scoreRange || undefined
  });

  return (
    <QueuePageShell
      eyebrow="Growth Engine"
      title="Business Health Score Leads"
      description="Public Business Health Score reports, scores, and onboarding handoffs. Use this to turn weak business systems into Ferocity setup conversations."
    >
      <div className="button-row section-actions">
        <Link className="button" href="/business-health-score">
          <Globe2 size={16} /> Open public score
        </Link>
        <Link className="button secondary-button" href="/app/access-requests">
          Public requests
        </Link>
      </div>

      <section className="grid section-actions">
        <Metric label="Reports" value={stats.reports} />
        <Metric label="Weak scores" value={stats.weakSites} />
        <Metric label="Average score" value={stats.averageScore} />
        <Metric label="Failed scans" value={stats.failedScans} />
      </section>

      <section className="panel section-actions">
        <h2>
          <Gauge size={18} /> Reports
        </h2>
        <p className="muted">
          Reports do not turn on publishing, sends, ads, payments, or billing. They show where setup should begin.
        </p>
        <form className="filter-bar section-actions" action="/app/website-grader">
          <input name="industry" placeholder="Industry" defaultValue={params.industry ?? ""} />
          <input name="state" placeholder="State" defaultValue={params.state ?? ""} />
          <select name="scoreRange" defaultValue={params.scoreRange ?? ""}>
            <option value="">All scores</option>
            <option value="red">0-49 red</option>
            <option value="yellow">50-74 yellow</option>
            <option value="green">75-100 green</option>
          </select>
          <button className="button secondary-button" type="submit">Filter</button>
          <Link className="button secondary-button" href="/app/website-grader">Clear</Link>
        </form>
        <QueueTable<WebsiteGraderReportRow>
          rows={rows}
          emptyMessage="No Business Health Score reports yet."
          columns={[
            {
              key: "business",
              label: "Business",
              render: (row) => (
                <>
                  <strong>{row.companyName || row.websiteUrl}</strong>
                  <span className="muted">{row.businessType || "No business type"} / {[row.city, row.state].filter(Boolean).join(", ") || "No location"} / {row.email}</span>
                  {row.websiteUrl.startsWith("http") ? <a href={row.websiteUrl}>{row.websiteUrl}</a> : <span className="muted">No website provided</span>}
                </>
              )
            },
            {
              key: "score",
              label: "Score",
              render: (row) => (
                <>
                  <strong>{row.score}/100</strong>
                  <span className={`pill ${row.score < 55 ? "high" : row.score < 70 ? "medium" : ""}`}>{row.gradeLabel}</span>
                </>
              )
            },
            {
              key: "finding",
              label: "Top Finding",
              render: (row) => (
                <>
                  <span>{row.topFinding}</span>
                  <span className="muted">{dateLabel(row.createdAt)}</span>
                </>
              )
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <div className="inline-actions">
                  <Link className="mini-button" href={`/website-grader/report/${row.reportToken}`}>
                    View report
                  </Link>
                  <Link className="mini-button secondary-button" href={`/start?source=business_health_score_admin&website=${encodeURIComponent(row.websiteUrl.startsWith("http") ? row.websiteUrl : "")}`}>
                    Start setup
                  </Link>
                </div>
              )
            }
          ]}
        />
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}
