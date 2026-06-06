import Link from "next/link";
import { ArrowRight, CheckCircle2, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { queryPostgres } from "@/lib/db/postgres";
import type {
  BusinessHealthCategory,
  BusinessHealthOpportunity,
  EcosystemRecommendation,
  WebsiteGradeFinding,
  WebsiteGradeStep
} from "@/lib/website-grader/grader";

type ReportMetadata = {
  categoryScores?: BusinessHealthCategory[];
  strengths?: WebsiteGradeFinding[];
  weaknesses?: WebsiteGradeFinding[];
  opportunities?: BusinessHealthOpportunity[];
  ecosystemRecommendations?: EcosystemRecommendation[];
  operations?: {
    city?: string | null;
    state?: string | null;
    googleBusinessProfileUrl?: string | null;
  };
};

type ReportRow = {
  report_token: string;
  status: string;
  website_url: string;
  final_url: string | null;
  email: string;
  name: string | null;
  company_name: string | null;
  business_type: string | null;
  score: number;
  grade_label: string;
  extraction_json: {
    title?: string | null;
    serviceHints?: string[];
    serviceAreaHints?: string[];
  } | null;
  findings_json: WebsiteGradeFinding[] | null;
  recommended_steps_json: WebsiteGradeStep[] | null;
  metadata_json: ReportMetadata | null;
};

async function getReport(token: string) {
  const result = await queryPostgres<ReportRow>(
    `
    select report_token, status, website_url, final_url, email, name, company_name, business_type,
      score, grade_label, extraction_json, findings_json, recommended_steps_json, metadata_json
    from public.website_grader_reports
    where report_token = $1 and status <> 'spam'
    limit 1
    `,
    [token]
  );
  return result?.rows[0] ?? null;
}

function scoreClass(score: number) {
  if (score >= 75) return "";
  if (score >= 50) return "medium";
  return "high";
}

function scoreText(status: string) {
  if (status === "good") return "strong";
  if (status === "missing") return "weak";
  return "needs work";
}

export default async function WebsiteGraderReportPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ scan?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const report = await getReport(token);

  if (!report) {
    return (
      <main className="public-page">
        <section className="public-shell">
          <nav className="public-nav">
            <Link className="brand-mark" href="/">Ferocity</Link>
            <div><Link href="/website-grader">Business Health Score</Link></div>
          </nav>
          <section className="public-hero">
            <p className="eyebrow">Report not found</p>
            <h1>This Business Health Score is not available.</h1>
            <Link className="button" href="/website-grader">Run a new score</Link>
          </section>
        </section>
      </main>
    );
  }

  const extraction = report.extraction_json ?? {};
  const metadata = report.metadata_json ?? {};
  const findings = report.findings_json ?? [];
  const categories = metadata.categoryScores ?? [];
  const strengths = metadata.strengths ?? findings.filter((item) => item.status === "good").slice(0, 5);
  const weaknesses = metadata.weaknesses ?? findings.filter((item) => item.status !== "good").slice(0, 5);
  const steps = report.recommended_steps_json ?? [];
  const opportunities = metadata.opportunities ?? [];
  const ecosystemRecommendations = metadata.ecosystemRecommendations ?? [];
  const failed = report.status === "failed" || search.scan === "failed";
  const hasRealWebsite = report.website_url.startsWith("http://") || report.website_url.startsWith("https://");
  const location = [metadata.operations?.city, metadata.operations?.state].filter(Boolean).join(", ");

  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/website-grader">Business Health Score</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Ferocity Business Health Score</p>
          <h1>{report.company_name || extraction.title || "Business health report"}</h1>
          <p className="muted">
            {failed
              ? "Ferocity could not scan the public page. You can still start setup and add the website details later."
              : "This report shows the business score, category scores, strengths, weaknesses, opportunity estimates, and what Ferocity would fix first."}
          </p>
          <div className="button-row">
            {hasRealWebsite ? (
              <a className="button secondary-button" href={report.final_url ?? report.website_url}>
                Open website
              </a>
            ) : null}
            <Link className="button secondary-button" href="/website-grader">
              Run another score
            </Link>
            <Link className="button secondary-button" href="/pricing">
              See plans
            </Link>
          </div>
        </section>

        <section className="grid">
          <div className="panel span-4 metric">
            <span className="muted">Overall Score</span>
            <strong>{report.score}/100</strong>
            <small className={`pill ${scoreClass(report.score)}`}>{report.grade_label}</small>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Business Type</span>
            <strong>{report.business_type || "Local service"}</strong>
            <small className="muted">{location || "Location not provided"}</small>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Online Inputs</span>
            <strong>{hasRealWebsite ? "Website included" : "No website"}</strong>
            <small className="muted">{metadata.operations?.googleBusinessProfileUrl ? "Google profile included" : "Google profile not provided"}</small>
          </div>
        </section>

        <section className="panel section-actions">
          <h2>
            <Gauge size={18} /> Category Scores
          </h2>
          <div className="health-category-grid">
            {categories.map((item) => (
              <div className="health-category" key={item.key}>
                <span>{item.label}</span>
                <strong>{item.score}</strong>
                <small className={`pill ${scoreClass(item.score)}`}>{scoreText(item.status)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="grid section-actions">
          <div className="panel span-6">
            <h2>
              <CheckCircle2 size={18} /> Strengths
            </h2>
            <ul className="list">
              {strengths.length ? strengths.map((finding) => (
                <li className="list-row" key={`${finding.area}-${finding.title}`}>
                  <div>
                    <h3>{finding.title}</h3>
                    <p>{finding.body}</p>
                  </div>
                  <span className="pill">strong</span>
                </li>
              )) : <li className="list-row"><span className="muted">No major strengths were found yet.</span></li>}
            </ul>
          </div>

          <div className="panel span-6">
            <h2>
              <ShieldCheck size={18} /> Top Weaknesses
            </h2>
            <ul className="list">
              {weaknesses.slice(0, 5).map((finding) => (
                <li className="list-row" key={`${finding.area}-${finding.title}`}>
                  <div>
                    <h3>{finding.title}</h3>
                    <p>{finding.body}</p>
                  </div>
                  <span className={`pill ${finding.status === "missing" ? "high" : "medium"}`}>{scoreText(finding.status)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel section-actions">
          <h2>
            <Sparkles size={18} /> Opportunity Estimates
          </h2>
          <p className="muted">These are estimates only. Actual results depend on traffic, pricing, close rate, service area, and execution.</p>
          <div className="health-category-grid">
            {opportunities.map((item) => (
              <div className="health-category" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small className="muted">{item.detail}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="grid section-actions">
          <div className="panel span-7">
            <h2>
              <Gauge size={18} /> Full Findings
            </h2>
            <ul className="list">
              {findings.map((finding) => (
                <li className="list-row" key={`${finding.area}-${finding.title}`}>
                  <div>
                    <h3>{finding.title}</h3>
                    <p className="muted">{finding.area}</p>
                    <p>{finding.body}</p>
                  </div>
                  <span className={`pill ${finding.status === "missing" ? "high" : finding.status === "needs_work" ? "medium" : ""}`}>
                    {scoreText(finding.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel span-5">
            <h2>
              <CheckCircle2 size={18} /> Recommended Actions
            </h2>
            <ul className="list">
              {steps.map((step) => (
                <li className="list-row" key={step.title}>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    <p className="muted">{step.ferocityArea}</p>
                  </div>
                  <span className={`pill ${step.priority === "high" ? "high" : ""}`}>{step.priority}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid section-actions">
          <article className="panel span-6">
            <h2>Unlock Full AI Growth Plan</h2>
            <p className="muted">
              Get the full report as a one-time purchase, or get it included with Starter and higher. It adds competitor comparison,
              SEO analysis, review analysis, marketing analysis, automation analysis, AI recommendations, and a custom 90-day action plan.
            </p>
            <strong className="price-line">$49 one-time or included with Starter+</strong>
            <Link className="button" href={`/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade`}>
              Choose report path <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing#ai-growth-report">
              Compare options
            </Link>
          </article>
          <article className="panel span-6">
            <h2>Ferocity Ecosystem Fit</h2>
            <ul className="list">
              {ecosystemRecommendations.map((item) => (
                <li className="list-row" key={`${item.product}-${item.issue}`}>
                  <div>
                    <h3>{item.product}</h3>
                    <p>{item.recommendation}</p>
                    <p className="muted">{item.issue}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="grid section-actions">
          <form action="/api/access-requests" method="post" className="panel form-stack span-7">
            <input name="sourceDetail" type="hidden" value={`business_health_score:${report.report_token}`} />
            <input name="websiteUrl" type="hidden" value={hasRealWebsite ? report.website_url : ""} />
            <input name="email" type="hidden" value={report.email} />
            <input name="name" type="hidden" value={report.name ?? ""} />
            <input name="companyName" type="hidden" value={report.company_name ?? extraction.title ?? ""} />
            <input name="businessType" type="hidden" value={report.business_type ?? ""} />
            <input name="mainGoal" type="hidden" value="seo_reviews" />
            <input name="requestedPlan" type="hidden" value="not_sure" />
            <input name="leadSources" type="hidden" value="website_form" />
            <input name="leadSources" type="hidden" value="local_seo" />
            <input name="leadSources" type="hidden" value="reviews" />
            <input name="message" type="hidden" value={`Started from Ferocity Business Health Score report ${report.report_token}. Score: ${report.score}/100 (${report.grade_label}).`} />
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div>
              <p className="eyebrow">Next step</p>
              <h2>Fix these problems with Ferocity</h2>
              <p className="muted">
                Ferocity can use this score as the starting point for AI setup, CRM automation, review generation, growth work,
                source tracking, invoices, and operator visibility.
              </p>
            </div>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about setup and access.</span>
            </label>
            <label className="checkbox-row">
              <input name="createWorkspace" type="checkbox" defaultChecked />
              <span>Create a starter workspace and send me an invite link.</span>
            </label>
            <button className="button" type="submit">
              Start setup from this score <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <h2>
              <ShieldCheck size={18} /> Safe Handoff
            </h2>
            <p className="muted">
              Starting setup from this score does not send customer messages, publish SEO pages, change ads, process payments, or start billing.
            </p>
            <div className="stacked-list">
              <div className="list-row flush-row">
                <span>Website</span>
                <strong>{hasRealWebsite ? report.website_url : "Not provided"}</strong>
              </div>
              <div className="list-row flush-row">
                <span>Services found</span>
                <strong>{extraction.serviceHints?.length ?? 0}</strong>
              </div>
              <div className="list-row flush-row">
                <span>Areas found</span>
                <strong>{extraction.serviceAreaHints?.length ?? 0}</strong>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
