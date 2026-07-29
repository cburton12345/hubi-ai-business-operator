import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { queryPostgres } from "@/lib/db/postgres";

type ReportRow = {
  id: string;
  report_token: string;
  email: string;
  company_name: string | null;
  business_type: string | null;
  score: number;
  grade_label: string;
};

type UpgradeRow = {
  upgrade_status: string;
  selected_path: string;
  selected_plan: string | null;
  amount_cents: number;
  created_at: Date;
};

async function getReport(token: string) {
  const result = await queryPostgres<ReportRow>(
    `
    select id, report_token, email, company_name, business_type, score, grade_label
    from public.website_grader_reports
    where report_token = $1 and status <> 'spam'
    limit 1
    `,
    [token]
  );
  return result?.rows[0] ?? null;
}

async function getLatestUpgrade(token: string) {
  const result = await queryPostgres<UpgradeRow>(
    `
    select upgrade_status, selected_path, selected_plan, amount_cents, created_at
    from public.business_health_report_upgrades
    where report_token = $1
    order by created_at desc
    limit 1
    `,
    [token]
  );
  return result?.rows[0] ?? null;
}

function statusCopy(status?: string) {
  if (status === "stripe_not_ready") return "Your report request was saved. Checkout is being prepared for this report.";
  if (status === "checkout_cancelled") return "Checkout was cancelled. Nothing was charged.";
  if (status === "stripe_error") return "Checkout could not start. The request was saved and is safe to retry.";
  if (status === "stripe_missing_url") return "Checkout could not open. The request was saved for review.";
  if (status === "checkout_started") return "Checkout started. After payment, Ferocity records the report path and next setup step.";
  return null;
}

export default async function AiGrowthReportUpgradePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const [report, latestUpgrade] = await Promise.all([getReport(token), getLatestUpgrade(token)]);
  const notice = statusCopy(search.status);

  if (!report) {
    return (
      <main className="public-page">
        <section className="public-shell">
          <nav className="public-nav">
            <Link className="brand-mark" href="/">Ferocity</Link>
            <div><Link href="/business-health-score">Business Grader</Link></div>
          </nav>
          <section className="public-hero">
            <p className="eyebrow">Report not found</p>
            <h1>This report upgrade page is not available.</h1>
            <Link className="button" href="/business-health-score">Run a new score</Link>
          </section>
        </section>
      </main>
    );
  }

  const fullReportItems = [
    "Where income is being missed",
    "What Ferocity can set up first",
    "Local SEO and service-area plan",
    "Review and reputation plan",
    "Lead capture and follow-up plan",
    "Recommended automations",
    "30/60/90 day action plan"
  ];

  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href={`/business-health-score/report/${report.report_token}`}>Back to report</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Business Autopilot Blueprint</p>
          <h1>Turn this score into the first Ferocity setup plan.</h1>
          <p className="muted">
            {report.company_name || "This business"} scored {report.score}/100. The Blueprint shows where income is being missed,
            what Ferocity can help handle, and which lead, review, SEO, follow-up, job, and money workflows should be set up first.
          </p>
          {notice ? <p className="success-panel">{notice}</p> : null}
        </section>

        <section className="grid">
          <div className="panel span-4 metric">
            <span className="muted">Business</span>
            <strong>{report.company_name || "Business report"}</strong>
            <small className="muted">{report.business_type || "Local service"}</small>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Current score</span>
            <strong>{report.score}/100</strong>
            <small className="pill">{report.grade_label}</small>
          </div>
          <div className="panel span-4 metric">
            <span className="muted">Report status</span>
            <strong>{latestUpgrade?.upgrade_status?.replaceAll("_", " ") ?? "free score"}</strong>
            <small className="muted">{latestUpgrade ? `Last path: ${latestUpgrade.selected_path}` : "No paid report request yet"}</small>
          </div>
        </section>

        <section className="grid section-actions">
          <article className="panel span-5">
            <h2>
              <Sparkles size={18} /> What the Blueprint adds
            </h2>
            <ul className="plain-list">
              {fullReportItems.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel span-7">
            <h2>Choose how to get it</h2>
            <p className="muted">
              The free score stays free. The Business Autopilot Blueprint is included with every paid plan, or it can be bought once and credited toward the first month.
            </p>
            <div className="stacked-list">
              <form action="/api/business-health-score/upgrade" method="post" className="list-row flush-row">
                <input name="reportToken" type="hidden" value={report.report_token} />
                <input name="selectedPath" type="hidden" value="job_tracker" />
                <div>
                  <h3>Job Tracker starts simple</h3>
                  <p className="muted">$39/mo. Best if they mainly need bids, jobs, materials, people paid, and basic payment tracking first.</p>
                </div>
                <button className="mini-button" type="submit">
                  Start Job Tracker <ArrowRight size={14} />
                </button>
              </form>
              <form action="/api/business-health-score/upgrade" method="post" className="list-row flush-row">
                <input name="reportToken" type="hidden" value={report.report_token} />
                <input name="selectedPath" type="hidden" value="starter" />
                <div>
                  <h3>Starter includes the Blueprint</h3>
                  <p className="muted">$79/mo. Best if they want Ferocity watching leads, follow-up, reviews, simple jobs, proof drafts, owner alerts, and basic reports.</p>
                </div>
                <button className="mini-button" type="submit">
                  Start Starter <ArrowRight size={14} />
                </button>
              </form>
              <form action="/api/business-health-score/upgrade" method="post" className="list-row flush-row">
                <input name="reportToken" type="hidden" value={report.report_token} />
                <input name="selectedPath" type="hidden" value="one_time" />
                <div>
                  <h3>Buy the Blueprint once</h3>
                  <p className="muted">$49 one-time. Use this when they want the diagnosis and setup roadmap before starting a monthly workspace.</p>
                </div>
                <button className="mini-button secondary-button" type="submit">
                  Unlock for $49
                </button>
              </form>
              <form action="/api/business-health-score/upgrade" method="post" className="list-row flush-row">
                <input name="reportToken" type="hidden" value={report.report_token} />
                <input name="selectedPath" type="hidden" value="growth" />
                <div>
                  <h3>Growth includes refreshes</h3>
              <p className="muted">$199/mo. Best for SEO drafts, reviews, proof capture, marketing campaigns, attribution, and weekly growth briefs.</p>
                </div>
                <button className="mini-button" type="submit">
                  Start Growth
                </button>
              </form>
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>
                <ShieldCheck size={18} /> Safe by default
              </h2>
              <p className="muted">
                This page does not send messages, publish SEO pages, change ads, process payments, or turn on automations by itself.
                It records the chosen path and hands off to checkout or setup with the same review controls used across Ferocity.
              </p>
            </div>
            <Link className="button secondary-button" href={`/business-health-score/report/${report.report_token}`}>
              Back to free report
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
