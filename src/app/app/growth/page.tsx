import Link from "next/link";
import { Activity, BarChart3, CheckCircle2, ClipboardCheck, Radio, RefreshCw } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { FacebookConnectorPairing } from "@/components/growth/FacebookConnectorPairing";
import { getChannelPlaybooks } from "@/lib/growth/channel-playbook";
import { getGrowthOperatorDashboard } from "@/lib/growth/get-growth-operator";
import { getGrowthDistributionDashboard } from "@/lib/growth/get-growth-distribution";
import {
  addDistributionIdentityAction,
  addGrowthCommunityAction,
  captureGrowthOpportunityAction,
  convertGrowthOpportunityToLeadAction,
  createGrowthObjectiveAction,
  queueGrowthResponseAction,
  scanGrowthLoopAction,
  updateContentQualityReviewAction,
  updateFollowUpWorkflowAction,
  updateGrowthInsightAction,
  updatePublishingQueueAction,
  updateSeoOpportunityAction
} from "./actions";

function dateLabel(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function GrowthOperatorPage() {
  const [dashboard, playbooks, distribution] = await Promise.all([
    getGrowthOperatorDashboard(), getChannelPlaybooks(), getGrowthDistributionDashboard()
  ]);

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
          SEO
        </Link>
        <Link className="button secondary-button" href="/app/sites">
          Growth Sites
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

      <div className="grid section-actions">
        {[
          ["Relevant opportunities", distribution.weeklySummary.opportunities], ["Distribution actions", distribution.weeklySummary.actions],
          ["Conversations started", distribution.weeklySummary.conversations], ["Qualified leads", distribution.weeklySummary.leads],
          ["Estimates", distribution.weeklySummary.estimates], ["Pipeline", money(distribution.weeklySummary.pipelineCents)],
          ["Won revenue", money(distribution.weeklySummary.wonRevenueCents)]
        ].map(([label, value]) => <section className="panel span-2 metric" key={String(label)}><span className="muted">{label}</span><strong>{value}</strong><small className="muted">This week</small></section>)}
        <section className="panel span-12">
          <h2>Needs you</h2>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/approvals">{distribution.needsAttention.pendingApprovals} growth approvals</Link>
            <span className={`pill ${distribution.needsAttention.verificationRequired ? "high" : "low"}`}>{distribution.needsAttention.verificationRequired} identities need verification</span>
            <span className={`pill ${distribution.needsAttention.restrictedIdentities ? "high" : "low"}`}>{distribution.needsAttention.restrictedIdentities} restricted identities</span>
            <span className={`pill ${distribution.needsAttention.connectorWarnings ? "high" : "low"}`}>{distribution.needsAttention.connectorWarnings} connector warnings</span>
          </div>
        </section>
      </div>

      <div className="grid">
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>What should Ferocity grow?</h2>
              <p className="muted">Set the result in plain English. Ferocity uses it to rank opportunities and coordinate work across connected channels.</p>
            </div>
            <span className="pill">configure once · override anytime</span>
          </div>
          <form action={createGrowthObjectiveAction} className="form-stack">
            <div className="grid compact-grid">
              <label>Business<select name="brandId" required>{distribution.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
              <label>Objective<input name="name" required placeholder="Book more metal roofing jobs" /></label>
              <label>Service<input name="serviceFocus" placeholder="Metal roofing" /></label>
              <label>Area<input name="geography" placeholder="Within 75 miles of Eau Claire" /></label>
              <label>Lead target<input name="targetLeads" type="number" min="0" placeholder="30" /></label>
              <label>Revenue target<input name="targetRevenueDollars" type="number" min="0" placeholder="100000" /></label>
              <label>Time horizon<input name="timeHorizonDays" type="number" min="1" max="730" defaultValue="30" /></label>
              <label>Default authority<select name="autonomyLevel" defaultValue="suggest"><option value="suggest">Suggest</option><option value="approve">Ask before acting</option><option value="autopilot">Autopilot where allowed</option></select></label>
            </div>
            <button className="button" type="submit">Start objective</button>
          </form>
          <ul className="list section-actions">
            {distribution.objectives.map((objective) => <li className="list-row" key={objective.id}><div><h3>{objective.name}</h3><p className="muted">{objective.brandName} · {objective.serviceFocus ?? "All services"} · {objective.geography} · {objective.timeHorizonDays} days</p></div><div className="inline-actions"><span className="pill">{objective.autonomyLevel}</span><span className="pill">{objective.status}</span>{objective.targetLeads != null ? <span className="pill">{objective.targetLeads} leads</span> : null}{objective.targetRevenueCents != null ? <span className="pill">{money(objective.targetRevenueCents)}</span> : null}</div></li>)}
            {distribution.objectives.length === 0 ? <li className="list-row"><span className="muted">No growth objective yet. Start with the business result, not a channel.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Distribution identities</h2>
          <p className="muted">Map legitimate customer-owned accounts. Adding an identity never claims it is connected or enables live actions.</p>
          <form action={addDistributionIdentityAction} className="form-stack compact-form">
            <label>Business<select name="brandId" required>{distribution.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
            <label>Channel<select name="channelKey" required>{distribution.channelCatalog.map((channel) => <option value={channel.key} key={channel.key}>{channel.label}</option>)}</select></label>
            <label>Account or page name<input name="displayName" required placeholder="Acme Roofing" /></label>
            <label>Profile URL<input name="profileUrl" type="url" placeholder="https://…" /></label>
            <label>Identity role<select name="identityRole" defaultValue="distribution"><option value="primary">Primary business identity</option><option value="distribution">Distribution identity</option><option value="personal">Personal profile (suggestions only)</option></select></label>
            <label>Authority<select name="autonomyLevel" defaultValue="suggest"><option value="suggest">Suggest</option><option value="approve">Approval required</option><option value="autopilot">Autopilot where connected and safe</option></select></label>
            <button className="mini-button" type="submit">Add identity</button>
          </form>
          <ul className="list section-actions">
            {distribution.identities.map((identity) => <li className="list-row" key={identity.id}><div><h3>{identity.displayName}</h3><p className="muted">{identity.brandName} · {identity.channelKey} · {identity.identityRole} · {identity.connectionMode}</p>{identity.riskState === "verification_required" ? <p><strong>{identity.channelKey} needs your attention.</strong> Activity is paused. Complete verification directly with the platform; never send verification credentials to Ferocity.</p> : null}{identity.channelKey === "facebook" ? <FacebookConnectorPairing identityId={identity.id} /> : null}</div><div className="inline-actions"><span className="pill">{identity.authorizationStatus}</span><span className={`pill ${identity.riskState === "healthy" ? "low" : "high"}`}>{identity.riskState}</span><span className="pill">{identity.recentActions} recent actions</span><span className="pill">{identity.recentWarnings} warnings</span></div></li>)}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Community intelligence</h2>
          <p className="muted">Remember where a business belongs, why the community matters, and the freshest known rules before suggesting a post.</p>
          <form action={addGrowthCommunityAction} className="form-stack compact-form">
            <label>Business<select name="brandId" required>{distribution.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
            <label>Channel<select name="channelKey" required>{distribution.channelCatalog.filter((channel) => ["facebook", "reddit", "nextdoor", "linkedin", "craigslist"].includes(channel.key)).map((channel) => <option value={channel.key} key={channel.key}>{channel.label}</option>)}</select></label>
            <label>Community<input name="name" required placeholder="Eau Claire homeowners" /></label>
            <label>URL<input name="url" type="url" placeholder="https://…" /></label>
            <label>Area<input name="geography" placeholder="Eau Claire County" /></label>
            <label>Relevance (0–100)<input name="relevanceScore" type="number" min="0" max="100" defaultValue="50" /></label>
            <label>Known rules<textarea name="rulesText" rows={3} placeholder="Owner-supplied rules or a concise verified summary" /></label>
            <button className="mini-button" type="submit">Remember community</button>
          </form>
          <ul className="list section-actions">
            {distribution.communities.map((community) => <li className="list-row" key={community.id}><div><h3>{community.name}</h3><p className="muted">{community.brandName} · {community.channelKey} · {community.postingPolicy}</p></div><span className="pill">{community.relevanceScore}% match</span></li>)}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Demand opportunities</h2>
          <p className="muted">Capture expressed demand from official feeds, assisted review, or a pasted source. Ferocity scores context, preserves provenance, and moves approved opportunities into the existing lead system.</p>
          <form action={captureGrowthOpportunityAction} className="form-stack">
            <div className="grid compact-grid">
              <label>Business<select name="brandId" required>{distribution.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
              <label>Channel<select name="channelKey" required>{distribution.channelCatalog.map((channel) => <option value={channel.key} key={channel.key}>{channel.label}</option>)}</select></label>
              <label>Source URL<input name="sourceUrl" type="url" placeholder="Optional public source" /></label>
              <label>Service match<input name="serviceFocus" placeholder="Metal roofing" /></label>
              <label>Area match<input name="geography" placeholder="Eau Claire" /></label>
              <label>Person or business name<input name="authorLabel" placeholder="Optional" /></label>
              <label>Platform identity ID<input name="externalActorId" placeholder="Optional stable provider ID" /></label>
            </div>
            <label>What Ferocity noticed<textarea name="bodyExcerpt" required rows={3} placeholder="Paste the relevant request or conversation excerpt" /></label>
            <label>Suggested response<textarea name="suggestedResponse" rows={3} placeholder="Optional. Unsupported claims are blocked for review." /></label>
            <label>Verified business claims<textarea name="verifiedClaims" rows={2} placeholder="One proven claim per line, if needed by the response" /></label>
            <button className="mini-button" type="submit">Analyze opportunity</button>
          </form>
          <ul className="list section-actions">
            {distribution.opportunities.map((opportunity) => <li className="list-row" key={opportunity.id}><div><h3>{opportunity.detectedIntent.replaceAll("_", " ")}</h3><p>{opportunity.bodyExcerpt}</p><p className="muted">{opportunity.brandName} · {opportunity.channelKey} · {[opportunity.serviceFocus, opportunity.geographyText].filter(Boolean).join(" · ")}</p>{opportunity.suggestedResponse ? <p>Prepared: {opportunity.suggestedResponse}</p> : null}</div><div className="inline-actions"><span className="pill high">{opportunity.overallScore}</span><span className="pill">{opportunity.status}</span>{opportunity.suggestedResponse && !["blocked", "queued", "responded"].includes(opportunity.status) ? <form action={queueGrowthResponseAction}><input name="opportunityId" type="hidden" value={opportunity.id} /><button className="mini-button" type="submit">Send to approval</button></form> : null}{opportunity.leadId ? <Link className="mini-button" href={`/app/leads/${opportunity.leadId}`}>Open lead</Link> : <form action={convertGrowthOpportunityToLeadAction}><input name="opportunityId" type="hidden" value={opportunity.id} /><button className="mini-button" type="submit" disabled={opportunity.status === "blocked"}>Move to Leads</button></form>}</div></li>)}
            {distribution.opportunities.length === 0 ? <li className="list-row"><span className="muted">No demand opportunities captured yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Channel capability truth</h2>
          <p className="muted">Official, assisted, and manual capabilities are shown separately. Ferocity never labels an account or action live merely because a setup screen exists.</p>
          <div className="playbook-grid">
            {distribution.channelCatalog.map((channel) => <section className="playbook-card" key={channel.key}><div><h3>{channel.label}</h3><p className="muted">{channel.mode.replaceAll("_", " ")} · {channel.providerKey} · approval: {channel.approval}</p><p>{channel.note}</p></div><PlaybookList title="Available path" items={channel.capabilities.length ? channel.capabilities : ["No executable capability certified"]} /><PlaybookList title="Authentication" items={channel.authentication} /><PlaybookList title="Inbound events" items={channel.inboundEvents.length ? channel.inboundEvents : ["No inbound event certified"]} /><PlaybookList title="Account protection" items={channel.riskConstraints} /><details><summary>Unsupported capabilities</summary><p className="muted">{channel.unsupported.join(", ") || "None"}</p></details></section>)}
          </div>
        </section>

        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Channel Playbook</h2>
              <p className="muted">Recommended first channels by business type. Ferocity should prove organic, reviews, referrals, community, and follow-up before pushing paid spend.</p>
            </div>
            <Link className="mini-button" href="/app/reports">
              Track ROI
            </Link>
          </div>
          <div className="playbook-grid">
            {playbooks.map((playbook) => (
              <section className="playbook-card" key={playbook.brandId}>
                <div>
                  <h3>{playbook.brandName}</h3>
                  <p className="muted">{playbook.pathName}</p>
                  <p>{playbook.summary}</p>
                </div>
                <PlaybookList title="Start with" items={playbook.startWith} />
                <PlaybookList title="Use when useful" items={playbook.useLater} />
                <PlaybookList title="Do not rush" items={playbook.avoidAtFirst} />
                <PlaybookList title="Track proof" items={playbook.proofToTrack} />
              </section>
            ))}
            {playbooks.length === 0 ? (
              <section className="playbook-card">
                <h3>No active brands yet</h3>
                <p className="muted">Add a brand and business type so Ferocity can recommend the right channel mix.</p>
              </section>
            ) : null}
          </div>
        </section>

        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Growth Command Center</h2>
              <p className="muted">Simple weekly work: make better pages, get more reviews, follow up, publish consistently, and track what turns into revenue.</p>
            </div>
            <Link className="mini-button" href="/app/seo">
              SEO planner
            </Link>
          </div>
          <ul className="priority-list">
            {dashboard.nextBestActions.map((action, index) => (
              <li className="priority-row" key={action.title}>
                <span className="priority-number">{index + 1}</span>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <span className={`pill ${action.urgency}`}>{action.urgency}</span>
                <Link className="mini-button" href={action.href}>
                  Open
                </Link>
              </li>
            ))}
            {dashboard.nextBestActions.length === 0 ? (
              <li className="priority-row">
                <span className="priority-number">1</span>
                <div>
                  <h3>No urgent growth work found</h3>
                  <p className="muted">Run a scan after new leads, jobs, drafts, reviews, or marketing data changes.</p>
                </div>
                <span className="pill low">low</span>
                <Link className="mini-button" href="/app/growth">
                  Stay here
                </Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Pages To Create Or Refresh</h2>
          <p className="muted">Local SEO opportunities based on real brand services, locations, page inventory, and connected traffic metrics when available.</p>
          <ul className="list">
            {dashboard.seoOpportunities.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">
                    {[item.brandName, item.pageType, item.targetKeyword, item.cityFocus, item.serviceFocus].filter(Boolean).join(" / ")}
                  </p>
                  <p>{item.reason}</p>
                  <p className="muted">Next: {item.nextStep}</p>
                </div>
                <form action={updateSeoOpportunityAction} className="inline-actions">
                  <input name="opportunityId" type="hidden" value={item.id} />
                  <span className="pill high">{item.priorityScore}</span>
                  <select name="status" defaultValue={item.status}>
                    <option value="open">open</option>
                    <option value="planned">planned</option>
                    <option value="draft_created">draft_created</option>
                    <option value="in_review">in_review</option>
                    <option value="published_manually">published_manually</option>
                    <option value="paused">paused</option>
                    <option value="done">done</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                  <button className="mini-button" type="submit">
                    Save
                  </button>
                </form>
              </li>
            ))}
            {dashboard.seoOpportunities.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No page opportunities yet</h3>
                  <p className="muted">Run a scan after adding services, service areas, keywords, or page records.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Coverage Gaps</h2>
          <p className="muted">A quick check for brands that have services or service areas but not enough page and keyword coverage.</p>
          <ul className="list">
            {dashboard.weakAreas.map((area) => (
              <li className="list-row" key={`${area.brandName}-${area.label}`}>
                <div>
                  <h3>{area.brandName}</h3>
                  <p className="muted">{area.label}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{area.serviceCount} services</span>
                  <span className="pill">{area.locationCount} areas</span>
                  <span className="pill">{area.pageCount} pages</span>
                  <span className="pill">{area.keywordCount} keywords</span>
                </div>
              </li>
            ))}
            {dashboard.weakAreas.length === 0 ? (
              <li className="list-row">
                <span className="muted">No active brand coverage data yet.</span>
              </li>
            ) : null}
          </ul>
        </section>

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
              <p className="muted">Review and scheduling for website, GBP, social, email, and customer communication drafts.</p>
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
                  <p className="muted">Approved drafts can be queued before outside publishing accounts are connected.</p>
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
                  <h3>{followUp.contactName}</h3>
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
                  <p className="muted">Form/source tracking and manual source mapping populate this without demo data.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Growth Targets</h2>
          <p className="muted">Plain targets for leads, booked jobs, revenue, reviews, calls, and forms by channel.</p>
          <ul className="list">
            {dashboard.conversionTargets.map((target) => (
              <li className="list-row" key={target.id}>
                <div>
                  <h3>{target.label}</h3>
                  <p className="muted">
                    {target.sourceFamily} / {target.targetType} / {target.period}
                  </p>
                </div>
                <span className="pill">{target.targetValue.toLocaleString()}</span>
              </li>
            ))}
            {dashboard.conversionTargets.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No growth targets yet</h3>
                  <p className="muted">Ferocity can still track activity now; targets can be added after plan tiers and onboarding get tighter.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Review Flow</h2>
          <p className="muted">Review requests, negative-review interception, and GBP review readiness.</p>
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
                  <p className="muted">Run a quality review, scan, publishing state change, or follow-up action to populate this timeline.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}

function PlaybookList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <strong>{title}</strong>
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
