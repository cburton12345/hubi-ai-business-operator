import Link from "next/link";
import { Activity, AlertTriangle, MapPin, RefreshCw, Search, Star } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLocalPresenceDashboard } from "@/lib/local-presence/dashboard";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { approveAndApplyLocalProfileIssueAction, approveLocalReviewReplyAction, publishApprovedLocalReviewReplyAction, refreshLocalPresenceAction, saveLocalPresencePolicyAction } from "./actions";

const metricLabels: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Desktop Maps views",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Desktop Search views",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Mobile Maps views",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Mobile Search views",
  BUSINESS_DIRECTION_REQUESTS: "Direction requests",
  CALL_CLICKS: "Call clicks",
  WEBSITE_CLICKS: "Website clicks",
  BUSINESS_BOOKINGS: "Bookings"
};

export default async function LocalPresencePage() {
  const dashboard = await getLocalPresenceDashboard(await getCurrentWorkspaceId());
  const policy = dashboard.policy;
  return <QueuePageShell
    eyebrow="Local presence"
    title="Be accurate, active, trusted, and measurable locally"
    description="Ferocity coordinates profile accuracy, local content, honest reviews, search discovery, lead attribution, and revenue across provider adapters. Google Business Profile is first; the control plane is not Google-specific."
  >
    <div className="button-row section-actions">
      <form action={refreshLocalPresenceAction}><button className="button" type="submit"><RefreshCw size={16} /> Refresh local presence</button></form>
      <Link className="button secondary-button" href="/app/integrations/business-profile">Google connection</Link>
      <Link className="button secondary-button" href="/app/publishing-hub">Publishing Hub</Link>
      <Link className="button secondary-button" href="/app/review">Review requests</Link>
    </div>

    <section className="grid section-actions">
      {dashboard.profiles.map((profile) => <section className="panel span-6" key={profile.id}>
        <div className="list-row flush-row"><div><p className="eyebrow">{profile.provider_key.replaceAll("_", " ")}</p><h2><MapPin size={18} /> {profile.display_name}</h2></div><span className={`pill ${profile.profile_health_score >= 80 ? "low" : "medium"}`}>{profile.profile_health_score}/100</span></div>
        <div className="grid">
          <Score label="Complete" value={profile.completeness_score} />
          <Score label="Consistent" value={profile.consistency_score} />
          <Score label="Fresh" value={profile.freshness_score} />
        </div>
        <p className="muted">Reliable rank data is shown only when a supported source exists. Ferocity does not manufacture rankings from impressions.</p>
      </section>)}
      {dashboard.profiles.length === 0 ? <section className="panel span-12"><h2>No monitored local profile yet</h2><p className="muted">Connect and select a Google Business Profile location, then refresh. Apple, Bing, directories, and review platforms use the same model as adapters become available.</p></section> : null}
    </section>

    <section className="grid section-actions">
      {Object.entries(dashboard.metrics).map(([key, value]) => <section className="metric-card span-3" key={key}><small className="pill">last 30 days</small><strong>{value.toLocaleString()}</strong><span>{metricLabels[key] ?? key.replaceAll("_", " ").toLowerCase()}</span></section>)}
      {Object.keys(dashboard.metrics).length === 0 ? <section className="panel span-12"><h2><Activity size={18} /> Performance is not available yet</h2><p className="muted">Connect an authorized profile and refresh. Google access and quota determine which real metrics are available.</p></section> : null}
    </section>

    <section className="grid section-actions">
      <section className="panel span-6">
        <h2><AlertTriangle size={18} /> What needs attention</h2>
        <ul className="list">
          {dashboard.issues.map((issue) => <li className="list-row" key={issue.id}><div><h3>{issue.title}</h3><p className="muted">{issue.explanation}</p></div><div className="inline-actions"><span className={`pill ${issue.severity}`}>{issue.severity}</span>{issue.safe_to_auto_fix && issue.recommended_value_json != null ? <form action={approveAndApplyLocalProfileIssueAction}><input name="issueId" type="hidden" value={issue.id} /><button className="mini-button" type="submit">Approve safe update</button></form> : null}</div></li>)}
          {dashboard.issues.length === 0 ? <li className="list-row"><span className="muted">No open profile issues have been detected.</span></li> : null}
        </ul>
      </section>
      <section className="panel span-6">
        <h2><Search size={18} /> How customers found the business</h2>
        <ul className="list">
          {dashboard.searchQueries.map((query) => <li className="list-row" key={query.query}><strong>{query.query}</strong><span>{query.value ?? `< ${query.threshold ?? "private threshold"}`}</span></li>)}
          {dashboard.searchQueries.length === 0 ? <li className="list-row"><span className="muted">No reliable provider search-query data is available yet.</span></li> : null}
        </ul>
      </section>
    </section>

    <section className="panel section-actions">
      <h2><Star size={18} /> Review and reputation queue</h2>
      <p className="muted">Positive replies can be automated only after explicit opt-in. Negative, questionable, rating-only, or repetitive-looking responses stay with an owner or service-recovery workflow.</p>
      <ul className="list">
        {dashboard.reviewActions.map((action) => <li className="list-row" key={action.id}><div><h3>{action.reviewer_name || "Google customer"} · {action.star_rating ?? "—"}/5</h3><p>{action.comment_text || "No written comment"}</p>{action.proposed_reply ? <p className="muted">Proposed reply: {action.proposed_reply}</p> : <p className="muted">Routed for assessment; no automatic public response.</p>}</div><div className="inline-actions"><span className="pill">{action.status.replaceAll("_", " ")}</span>{action.proposed_reply && action.status !== "approved" ? <form action={approveLocalReviewReplyAction}><input name="actionId" type="hidden" value={action.id} /><button className="mini-button" type="submit">Approve reply</button></form> : null}{action.status === "approved" ? <form action={publishApprovedLocalReviewReplyAction}><input name="actionId" type="hidden" value={action.id} /><button className="mini-button" type="submit">Publish approved reply</button></form> : null}</div></li>)}
        {dashboard.reviewActions.length === 0 ? <li className="list-row"><span className="muted">No reviews currently need a response decision.</span></li> : null}
      </ul>
    </section>

    <form action={saveLocalPresencePolicyAction} className="panel form-stack section-actions">
      <div><p className="eyebrow">Owner policy</p><h2>Decide what Ferocity may do</h2></div>
      <div className="form-grid">
        <label>Authority<select name="authorityMode" defaultValue={policy?.authority_mode ?? "approval_required"}><option value="suggest">Suggest only</option><option value="approval_required">Approval required</option><option value="autopilot">Policy-controlled autopilot</option></select></label>
        <label>Positive auto-reply threshold<select name="positiveReplyMinStars" defaultValue={policy?.positive_reply_min_stars ?? 4}><option value="4">4+ stars</option><option value="5">5 stars only</option></select></label>
        <label>Negative-review threshold<select name="negativeReviewThreshold" defaultValue={policy?.negative_review_threshold ?? 3}><option value="1">1 star</option><option value="2">2 stars or below</option><option value="3">3 stars or below</option></select></label>
        <label>Negative-review route<select name="negativeReviewRoute" defaultValue={policy?.negative_review_route ?? "owner"}><option value="owner">Owner</option><option value="service_recovery">Service recovery</option><option value="approval_queue">Approval queue</option></select></label>
        <label>Stale after days<input name="staleAfterDays" type="number" min="7" max="365" defaultValue={policy?.stale_after_days ?? 45} /></label>
      </div>
      <label className="checkbox-row"><input name="useTrackedPhone" type="checkbox" defaultChecked={policy?.use_tracked_phone_when_appropriate ?? false} /> Recommend the active Ferocity/Connect number when appropriate; phone changes still require confirmation</label>
      <label className="checkbox-row"><input name="autoPreparePosts" type="checkbox" defaultChecked={policy?.auto_prepare_posts ?? true} /> Prepare useful local posts from real business events</label>
      <label className="checkbox-row"><input name="autoRequestReviews" type="checkbox" defaultChecked={policy?.auto_request_reviews ?? true} /> Prepare compliant review requests after completed work</label>
      <label className="checkbox-row"><input name="positiveReplyOptIn" type="checkbox" defaultChecked={policy?.positive_reply_opt_in ?? false} /> Explicitly opt in to policy-qualified automatic positive-review replies</label>
      <button className="button" type="submit">Save local presence policy</button>
    </form>

    <section className="panel section-actions">
      <h2>Business events ready for local use</h2>
      <p className="muted">These are real operational signals—not fabricated activity. Ferocity still requires suitable proof, useful content, provider capability, and the configured authority before publishing.</p>
      <ul className="list">{dashboard.events.map((event) => <li className="list-row" key={event.id}><div><strong>{event.event_type.replaceAll("_", " ")}</strong><p className="muted">Suggested: {event.recommended_destinations.join(", ").replaceAll("_", " ")}</p></div><span className="pill">{event.status}</span></li>)}</ul>
    </section>
  </QueuePageShell>;
}

function Score({ label, value }: { label: string; value: number }) {
  return <div className="metric-card span-4"><strong>{value}</strong><span>{label}</span></div>;
}
