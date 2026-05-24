import Link from "next/link";
import { Activity, BarChart3, CheckCircle2, ClipboardCheck, Radio, RefreshCw } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getGrowthOperatorDashboard } from "@/lib/growth/get-growth-operator";
import {
  scanGrowthLoopAction,
  updateContentQualityReviewAction,
  updateFollowUpWorkflowAction,
  updateGrowthInsightAction,
  updatePublishingQueueAction
} from "./actions";

function dateLabel(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function GrowthOperatorPage() {
  const dashboard = await getGrowthOperatorDashboard();

  return (
    <QueuePageShell
      eyebrow="Growth Operator"
      title="Closed-Loop Growth System"
      description="Connect SEO, publishing, review flow, lead recovery, attribution, and revenue without turning marketing into spam or disconnected agency work."
    >
      <div className="button-row section-actions">
        <form action={scanGrowthLoopAction}>
          <button className="button" type="submit">
            <RefreshCw size={16} /> Scan growth loop
          </button>
        </form>
        <Link className="button secondary-button" href="/app/seo">
          SEO Autopilot
        </Link>
        <Link className="button secondary-button" href="/app/review">
          Review Drafts
        </Link>
      </div>

      <div className="grid section-actions">
        {dashboard.metrics.map((metric) => (
          <section className="panel span-2 metric" key={metric.label}>
            <BarChart3 size={18} />
            <span className="muted">{metric.label}</span>
            <strong>{metric.label === "Attributed revenue" ? `$${metric.value.toLocaleString()}` : metric.value.toLocaleString()}</strong>
            <small className="muted">{metric.detail}</small>
          </section>
        ))}
      </div>

      <div className="grid">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Operator Insights</h2>
              <p className="muted">Proactive risks and recovery opportunities from the growth loop.</p>
            </div>
            <Activity size={20} />
          </div>
          <ul className="list">
            {dashboard.insights.map((insight) => (
              <li className="list-row" key={insight.id}>
                <div>
                  <h3>{insight.title}</h3>
                  <p className="muted">{insight.summary}</p>
                  <p>{insight.recommendation}</p>
                </div>
                <form action={updateGrowthInsightAction} className="inline-actions">
                  <input name="insightId" type="hidden" value={insight.id} />
                  <span className={`pill ${insight.severity}`}>{insight.severity}</span>
                  <select name="status" defaultValue={insight.status}>
                    <option value="acknowledged">acknowledged</option>
                    <option value="resolved">resolved</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                  <button className="mini-button" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
            {dashboard.insights.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No open growth insights</h3>
                  <p className="muted">Run a scan to surface content quality, attribution, review, and follow-up gaps.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Content Quality Guardrails</h2>
              <p className="muted">Block thin, generic, unsupported, or low-conversion content before it reaches the queue.</p>
            </div>
            <ClipboardCheck size={20} />
          </div>
          <ul className="list">
            {dashboard.qualityReviews.map((review) => (
              <li className="list-row" key={review.id}>
                <form action={updateContentQualityReviewAction} className="form-stack compact-form">
                  <input name="reviewId" type="hidden" value={review.id} />
                  <div>
                    <h3>{review.title}</h3>
                    <p className="muted">
                      {review.brandName} / {review.contentType} / {review.riskFlags.length ? review.riskFlags.join(", ") : "no flags"}
                    </p>
                  </div>
                  <div className="grid compact-grid">
                    <label>
                      Status
                      <select name="qualityStatus" defaultValue={review.status}>
                        <option value="needs_review">needs_review</option>
                        <option value="passed">passed</option>
                        <option value="needs_edit">needs_edit</option>
                        <option value="blocked">blocked</option>
                      </select>
                    </label>
                    <label>
                      Useful
                      <input name="usefulnessScore" type="number" min="0" max="100" defaultValue={review.usefulnessScore} />
                    </label>
                    <label>
                      Local
                      <input name="localRelevanceScore" type="number" min="0" max="100" defaultValue={review.localRelevanceScore} />
                    </label>
                    <label>
                      Original
                      <input name="originalityScore" type="number" min="0" max="100" defaultValue={review.originalityScore} />
                    </label>
                    <label>
                      Converts
                      <input name="conversionClarityScore" type="number" min="0" max="100" defaultValue={review.conversionClarityScore} />
                    </label>
                  </div>
                  <textarea name="reviewerNotes" placeholder="Internal quality notes" rows={2} />
                  <button className="mini-button" type="submit">
                    Save quality review
                  </button>
                </form>
              </li>
            ))}
            {dashboard.qualityReviews.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No quality reviews yet</h3>
                  <p className="muted">Run a scan after generating SEO drafts to create review records.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Publishing Queue</h2>
              <p className="muted">Approval and scheduling readiness for website, GBP, social, email, and SMS publishing.</p>
            </div>
            <Radio size={20} />
          </div>
          <ul className="list">
            {dashboard.publishingQueue.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {item.brandName} / {item.targetPlatform} / {dateLabel(item.scheduledFor)}
                  </p>
                </div>
                <form action={updatePublishingQueueAction} className="inline-actions">
                  <input name="queueId" type="hidden" value={item.id} />
                  <span className="pill">{item.providerStatus}</span>
                  <select name="queueStatus" defaultValue={item.queueStatus}>
                    <option value="draft">draft</option>
                    <option value="needs_approval">needs_approval</option>
                    <option value="approved">approved</option>
                    <option value="scheduled">scheduled</option>
                    <option value="published_manually">published_manually</option>
                    <option value="failed">failed</option>
                    <option value="canceled">canceled</option>
                  </select>
                  <button className="mini-button" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
            {dashboard.publishingQueue.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No publishing queue items</h3>
                  <p className="muted">Approved drafts can be queued without connecting provider keys yet.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Follow-Up Recovery</h2>
              <p className="muted">Stale leads, ignored estimates, callbacks, and nurture reminders.</p>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <ul className="list">
            {dashboard.followUps.map((followUp) => (
              <li className="list-row" key={followUp.id}>
                <div>
                  <h3>{followUp.leadName}</h3>
                  <p className="muted">
                    {followUp.brandName ?? "Workspace"} / {followUp.workflowType} / due {dateLabel(followUp.dueAt)}
                  </p>
                  {followUp.aiSuggestedMessage ? <p>{followUp.aiSuggestedMessage}</p> : null}
                </div>
                <form action={updateFollowUpWorkflowAction} className="inline-actions">
                  <input name="workflowId" type="hidden" value={followUp.id} />
                  <span className="pill">{followUp.channel}</span>
                  <select name="status" defaultValue={followUp.status}>
                    <option value="open">open</option>
                    <option value="scheduled">scheduled</option>
                    <option value="completed">completed</option>
                    <option value="missed">missed</option>
                    <option value="canceled">canceled</option>
                  </select>
                  <button className="mini-button" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
            {dashboard.followUps.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No open follow-ups</h3>
                  <p className="muted">Run a scan to create recovery workflows from real stale leads.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Attribution To Revenue</h2>
          <p className="muted">The beginning of the moat: which channels, campaigns, services, and cities create real jobs and revenue.</p>
          <ul className="list">
            {dashboard.attribution.map((source) => (
              <li className="list-row" key={source.id}>
                <div>
                  <h3>{source.sourceName}</h3>
                  <p className="muted">
                    {[source.brandName, source.sourceFamily, source.campaignName, source.serviceFocus, source.cityFocus].filter(Boolean).join(" / ")}
                  </p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{source.leads} leads</span>
                  <span className="pill">{source.jobs} jobs</span>
                  <span className="pill">{money(source.revenueCents)}</span>
                </div>
              </li>
            ))}
            {dashboard.attribution.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No attribution sources yet</h3>
                  <p className="muted">Future form/source tracking and manual source mapping will populate this without demo data.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Review Flow</h2>
          <p className="muted">Review requests, negative-review interception, and future GBP review readiness.</p>
          <ul className="list">
            {dashboard.reviewWorkflows.map((workflow) => (
              <li className="list-row" key={workflow.id}>
                <div>
                  <h3>{workflow.customerName}</h3>
                  <p className="muted">
                    {workflow.brandName ?? "Workspace"} / {workflow.triggerEvent} / {workflow.channel} / {dateLabel(workflow.scheduledFor)}
                  </p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{workflow.status}</span>
                  <span className="pill">{workflow.negativeInterceptionStatus}</span>
                </div>
              </li>
            ))}
            {dashboard.reviewWorkflows.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No review workflows yet</h3>
                  <p className="muted">Completed jobs can become draft review requests once the scan runs.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Unified Growth Timeline</h2>
          <p className="muted">Marketing, SEO, reviews, follow-ups, and revenue events in one operational history.</p>
          <ul className="list">
            {dashboard.timeline.map((event) => (
              <li className="list-row" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">
                    {event.family} / {event.type} / {dateLabel(event.occurredAt)}
                  </p>
                  {event.body ? <p>{event.body}</p> : null}
                </div>
              </li>
            ))}
            {dashboard.timeline.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No growth timeline events yet</h3>
                  <p className="muted">Quality reviews, scans, publishing state changes, and follow-up actions will appear here.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}
