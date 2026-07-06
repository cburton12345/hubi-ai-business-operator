import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, Gauge, Globe2, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getWebsiteGraderReports, type WebsiteGraderReportRow } from "@/lib/website-grader/get-website-grader-reports";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function stageLabel(stage: WebsiteGraderReportRow["leadStage"]) {
  return {
    new: "New",
    hot: "Hot lead",
    plan_interest: "Plan interest",
    manual_follow_up: "Needs follow-up",
    failed_scan: "Scan failed",
    nurture: "Nurture"
  }[stage];
}

function stageTone(stage: WebsiteGraderReportRow["leadStage"]) {
  if (stage === "manual_follow_up" || stage === "failed_scan") return "high";
  if (stage === "hot" || stage === "plan_interest") return "medium";
  return "";
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
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Lead generation command</p>
            <h2>Free score first. Setup conversation second.</h2>
            <p className="muted">
              Business Grader should pull people in with useful advice, then route hot reports into the Business Autopilot Blueprint, Starter, Growth, or a manual onboarding call.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              <Globe2 size={16} /> Public grader
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Plans
            </Link>
            <Link className="button secondary-button" href="/app/attention-command">
              Today
            </Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Reports" value={stats.reports} />
        <Metric label="Hot leads" value={stats.hotLeads} tone={stats.hotLeads ? "medium" : ""} />
        <Metric label="Upgrade requests" value={stats.upgradeRequests} tone={stats.upgradeRequests ? "high" : ""} />
        <Metric label="Plan interest" value={stats.planInterest} tone={stats.planInterest ? "medium" : ""} />
        <Metric label="Manual follow-up" value={stats.manualFollowUp} tone={stats.manualFollowUp ? "high" : ""} />
        <Metric label="Weak scores" value={stats.weakSites} />
        <Metric label="Average score" value={stats.averageScore} />
        <Metric label="Failed scans" value={stats.failedScans} tone={stats.failedScans ? "high" : ""} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2><CircleDollarSign size={18} /> Work These First</h2>
          <p className="muted">These are the reports most likely to become setup, paid reports, or subscriptions.</p>
          <ul className="list">
            {rows.filter((row) => ["manual_follow_up", "plan_interest", "hot", "failed_scan"].includes(row.leadStage)).slice(0, 6).map((row) => (
              <li className="list-row" key={row.id}>
                <div>
                  <h3>{row.companyName || row.websiteUrl}</h3>
                  <p className="muted">{row.score}/100 / {row.topFinding}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${stageTone(row.leadStage)}`}>{stageLabel(row.leadStage)}</span>
                  <Link className="mini-button" href={`/website-grader/report/${row.reportToken}`}>Open</Link>
                </div>
              </li>
            ))}
            {rows.filter((row) => ["manual_follow_up", "plan_interest", "hot", "failed_scan"].includes(row.leadStage)).length === 0 ? (
              <li className="list-row"><span className="muted">No hot grader follow-up right now.</span></li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2><Sparkles size={18} /> Follow-Up Path</h2>
          <p className="muted">Keep the free score useful. Sell the next step only when the report shows a real business gap.</p>
          <div className="path-grid">
            {[
              ["Free score", "Website, SEO, reviews, lead capture, automation readiness, and missed revenue estimate.", "/business-health-score"],
              ["Business setup plan", "A paid or included roadmap showing what Ferocity should build and run first.", "/pricing"],
              ["Starter or Growth", "Recurring subscription when they want lead capture, follow-up, owner alerts, reviews, proof, reports, and AI setup.", "/start?source=business_grader_admin"],
              ["Let Ferocity set it up", "Once inside Ferocity, AI helps configure the exact workflows instead of making them hunt through settings.", "/app/build-system"]
            ].map(([title, detail, href]) => (
              <Link className="path-card" href={href} key={title}>
                <ArrowRight size={18} />
                <strong>{title}</strong>
                <span>{detail}</span>
              </Link>
            ))}
          </div>
        </section>
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
                  <span className={`pill ${stageTone(row.leadStage)}`}>{stageLabel(row.leadStage)}</span>
                </>
              )
            },
            {
              key: "upgrade",
              label: "Growth Path",
              render: (row) => (
                <>
                  <span>{row.selectedPath ? row.selectedPath.replaceAll("_", " ") : "Free score"}</span>
                  <span className="muted">{row.upgradeStatus ? row.upgradeStatus.replaceAll("_", " ") : "No upgrade request yet"}</span>
                  {row.lastUpgradeAt ? <span className="muted">{dateLabel(row.lastUpgradeAt)}</span> : null}
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
                  <Link className="mini-button secondary-button" href="/app/build-system">
                    Build plan
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

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong className={tone ? `pill ${tone}` : undefined}>{value.toLocaleString()}</strong>
    </section>
  );
}
