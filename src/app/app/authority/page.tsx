import Link from "next/link";
import { BarChart3, FileText, Globe2, Megaphone, Search, ShieldCheck, Star, Video } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAuthorityDashboard, type AuthorityRow } from "@/lib/authority/get-authority-dashboard";
import { runAiAgentWorkflowAction } from "../ai-workforce/workflow-actions";
import { processCompletedJobsForAuthorityAction, updateAuthorityItemStatusAction } from "./actions";

export default async function AuthorityEnginePage() {
  const dashboard = await getAuthorityDashboard();

  return (
    <QueuePageShell
      eyebrow="Authority Engine"
      title="Turn Finished Work Into Long-Term Trust"
      description="Ferocity turns real jobs, proof, reviews, photos, videos, and customer questions into review-ready authority assets. Nothing public is invented or posted without approval."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">AI Chief Reputation Officer</p>
            <h2>Every completed job should make the business easier to find and easier to trust.</h2>
            <p className="muted">
              Authority Engine watches completed work, prepares proof requests, review requests, case studies, FAQs, posts, page improvements, and video scripts, then sends everything to review.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/authority/links">
              <Globe2 size={16} /> Link Authority
            </Link>
            <form action={processCompletedJobsForAuthorityAction}>
              <button className="button" type="submit">
                <ShieldCheck size={16} /> Process completed jobs
              </button>
            </form>
            <form action={runAiAgentWorkflowAction}>
              <input name="agentKey" type="hidden" value="authority_manager" />
              <button className="button secondary-button" type="submit">Run Authority Manager</button>
            </form>
            <Link className="button secondary-button" href="/app/review">Review queue</Link>
            <Link className="button secondary-button" href="/app/proof">Proof</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="metric-card span-3 authority-score-card">
          <small className="pill">Ferocity score</small>
          <strong>{dashboard.metrics.authorityScore}</strong>
          <span>Authority Score</span>
        </section>
        <Metric label="Completed jobs" value={dashboard.metrics.completedJobs} />
        <Metric label="Need processing" value={dashboard.metrics.unprocessedJobs} tone={dashboard.metrics.unprocessedJobs ? "medium" : ""} />
        <Metric label="Proof items" value={dashboard.metrics.proofItems} />
        <Metric label="Approved proof" value={dashboard.metrics.approvedProofItems} />
        <Metric label="Review requests" value={dashboard.metrics.reviewRequests} />
        <Metric label="Draft assets" value={dashboard.metrics.contentDrafts} />
        <Metric label="Publishing queue" value={dashboard.metrics.publishingQueue} />
        <Metric label="Content gaps" value={dashboard.metrics.openGaps} tone={dashboard.metrics.openGaps ? "medium" : ""} />
        <Metric label="Active backlinks" value={dashboard.metrics.activeBacklinks} />
        <Metric label="Link opportunities" value={dashboard.metrics.linkOpportunities} />
        <Metric label="Link risks" value={dashboard.metrics.linkRisks} tone={dashboard.metrics.linkRisks ? "medium" : ""} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>
            <BarChart3 size={18} /> Authority Score
          </h2>
          <div className="status-grid compact-status-grid">
            <Score label="Reviews" value={dashboard.score.reviewScore} />
            <Score label="Project proof" value={dashboard.score.projectProofScore} />
            <Score label="Content" value={dashboard.score.contentScore} />
            <Score label="Website" value={dashboard.score.websiteScore} />
            <Score label="Consistency" value={dashboard.score.consistencyScore} />
          </div>
          <ul className="list section-actions">
            {dashboard.score.explanations.map((item) => (
              <li className="list-row" key={item}>
                <div>
                  <h3>{item}</h3>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>
            <BarChart3 size={18} /> Score History
          </h2>
          <div className="score-history-bars">
            {dashboard.scoreHistory.map((row) => (
              <div key={row.id}>
                <span style={{ height: `${Math.max(8, row.score)}%` }} />
                <small>{row.score}</small>
              </div>
            ))}
          </div>
          {dashboard.scoreHistory.length === 0 ? (
            <p className="muted">No saved score history yet. Processing completed jobs records the first snapshot.</p>
          ) : (
            <p className="muted">Each bar is a saved Authority Score snapshot after Ferocity processes proof, review, content, and website signals.</p>
          )}
        </section>

        <RowPanel
          icon={<Search size={18} />}
          title="Why The Score Changed"
          rows={dashboard.scoreEvents}
          emptyTitle="No score-change feed yet"
          emptyDetail="When jobs are processed, proof is added, or website recommendations change, Ferocity records the reason here."
        />

        <section className="panel span-6">
          <h2>
            <Search size={18} /> What Needs Attention
          </h2>
          <ul className="list">
            {dashboard.score.missingSignals.map((item) => (
              <li className="list-row" key={item}>
                <div>
                  <h3>{item}</h3>
                  <p className="muted">Ferocity can prepare the next step and keep public action behind review.</p>
                </div>
                <span className="pill medium">gap</span>
              </li>
            ))}
            {dashboard.score.missingSignals.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No obvious authority gaps in the current workspace data.</h3>
                  <p className="muted">Keep collecting proof from completed work and reviewing draft assets.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <Panel
          icon={<ShieldCheck size={18} />}
          title="Projects Awaiting Processing"
          emptyTitle="No completed jobs waiting"
          emptyDetail="When jobs are marked completed, Ferocity can prepare the proof, review, content, and publishing bundle."
        >
          {dashboard.projectsAwaitingProcessing.map((job) => (
            <li className="list-row" key={job.id}>
              <div>
                <h3>{job.title}</h3>
                <p className="muted">{job.customerName} / {job.status}</p>
              </div>
              <span className="pill medium">ready</span>
            </li>
          ))}
        </Panel>

        <RowPanel
          icon={<Megaphone size={18} />}
          title="Today's Opportunities"
          rows={dashboard.opportunities}
          table="authority_events"
          emptyTitle="No authority events need review"
          emptyDetail="Process completed jobs or add proof to create the next authority opportunities."
        />

        <RowPanel
          icon={<FileText size={18} />}
          title="Completed Assets"
          rows={dashboard.completedAssets}
          emptyTitle="No authority bundles yet"
          emptyDetail="Use Process completed jobs to create case studies, FAQs, posts, review requests, and knowledge notes."
        />

        <RowPanel
          icon={<Globe2 size={18} />}
          title="Publishing Queue"
          rows={dashboard.publishingQueue}
          emptyTitle="No authority publishing queued"
          emptyDetail="Drafts will appear here after completed jobs are processed. Approval is still required."
        />

        <RowPanel
          icon={<Star size={18} />}
          title="Review Pipeline"
          rows={dashboard.reviewPipeline}
          emptyTitle="No review requests prepared"
          emptyDetail="Review requests are created from completed jobs and stay draft/manual until approved."
        />

        <RowPanel
          icon={<Video size={18} />}
          title="Video Pipeline"
          rows={dashboard.videoPipeline}
          emptyTitle="No video scripts yet"
          emptyDetail="Authority Engine creates scripts and scene plans first. Rendered video needs a connected video provider."
        />

        <RowPanel
          icon={<Search size={18} />}
          title="Content Gaps"
          rows={dashboard.contentGaps}
          table="authority_content_gaps"
          emptyTitle="No content gaps recorded"
          emptyDetail="Gaps come from completed jobs, customer questions, website reviews, and future community discovery."
        />

        <RowPanel
          icon={<Globe2 size={18} />}
          title="Website Recommendations"
          rows={dashboard.websiteRecommendations}
          table="authority_website_recommendations"
          emptyTitle="No website recommendations yet"
          emptyDetail="Ferocity can suggest service, city, proof, FAQ, schema, media, CTA, and internal-link improvements."
        />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Safe By Design</h2>
            <p className="muted">
              Authority Engine only uses real jobs, real proof, real customer context, and owner-reviewed facts. It does not create fake reviews, fake personas, fake outcomes, fake stats, or public posts without approval.
            </p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/marketing-os">Marketing OS</Link>
            <Link className="button secondary-button" href="/app/publishing-hub">Publishing Hub</Link>
            <Link className="button secondary-button" href="/app/website">Website Connector</Link>
          </div>
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-2">
      <small className={`pill ${tone}`}>authority</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="status-card">
      <span>{label}</span>
      <strong>{value}/100</strong>
    </div>
  );
}

function Panel({
  icon,
  title,
  emptyTitle,
  emptyDetail,
  children
}: {
  icon: React.ReactNode;
  title: string;
  emptyTitle: string;
  emptyDetail: string;
  children: React.ReactNode;
}) {
  const hasChildren = Boolean(Array.isArray(children) ? children.length : children);

  return (
    <section className="panel span-6">
      <h2>{icon} {title}</h2>
      <ul className="list">
        {hasChildren ? children : (
          <li className="list-row">
            <div>
              <h3>{emptyTitle}</h3>
              <p className="muted">{emptyDetail}</p>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

function RowPanel({
  icon,
  title,
  rows,
  table,
  emptyTitle,
  emptyDetail
}: {
  icon: React.ReactNode;
  title: string;
  rows: AuthorityRow[];
  table?: "authority_events" | "authority_content_gaps" | "authority_website_recommendations";
  emptyTitle: string;
  emptyDetail: string;
}) {
  return (
    <Panel icon={icon} title={title} emptyTitle={emptyTitle} emptyDetail={emptyDetail}>
      {rows.map((row) => (
        <li className="list-row" key={row.id}>
          <div>
            <h3>{row.href ? <Link className="inline-link" href={row.href}>{row.title}</Link> : row.title}</h3>
            <p className="muted">{row.detail}</p>
          </div>
          <div className="inline-actions">
            <span className="pill">{row.status.replaceAll("_", " ")}</span>
            {table ? (
              <>
                <form action={updateAuthorityItemStatusAction}>
                  <input name="itemId" type="hidden" value={row.id} />
                  <input name="table" type="hidden" value={table} />
                  <input name="status" type="hidden" value={table === "authority_events" ? "completed" : "approved"} />
                  <button className="mini-button" type="submit">Approve</button>
                </form>
                <form action={updateAuthorityItemStatusAction}>
                  <input name="itemId" type="hidden" value={row.id} />
                  <input name="table" type="hidden" value={table} />
                  <input name="status" type="hidden" value="dismissed" />
                  <button className="mini-button" type="submit">Dismiss</button>
                </form>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </Panel>
  );
}
