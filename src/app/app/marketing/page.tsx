import Link from "next/link";
import { BadgeDollarSign, CalendarDays, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getMarketingPlanRows } from "@/lib/marketing/get-phase2-dashboard";
import { getProviderPromotions } from "@/lib/marketing-os/provider-promotions";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import {
  approveProviderPromotionAction,
  captureProviderPromotionAction,
  declineProviderPromotionAction,
  generateWeeklyMarketingPlansAction,
  recordProviderPromotionProgressAction,
  requestManagedMarketingServiceAction
} from "./actions";

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function MarketingOperatorPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const [plans, managedPrograms, promotions] = await Promise.all([
    getMarketingPlanRows(),
    queryPostgres<{
      id: string;
      service_key: string;
      service_name: string;
      service_family: string;
      status: string;
      monthly_budget_cents: number;
      management_fee_bps: number;
      approval_mode: string;
      live_spend_enabled: boolean;
      live_publishing_enabled: boolean;
    }>(
      `
      select id, service_key, service_name, service_family, status, monthly_budget_cents,
        management_fee_bps, approval_mode, live_spend_enabled, live_publishing_enabled
      from public.managed_service_programs
      where tenant_id = $1 and status <> 'cancelled'
      order by created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    getProviderPromotions(workspaceId)
  ]);
  const managedRows = managedPrograms?.rows ?? [];

  return (
    <QueuePageShell
      eyebrow="AI Marketing Operator"
      title="Weekly Marketing Plans"
      description="Generate brand-aware weekly work for each organization workspace, then review drafts before anything goes public."
    >
      <div className="button-row section-actions">
        <form action={generateWeeklyMarketingPlansAction}>
          <button className="button" type="submit">
            <Sparkles size={16} /> Generate weekly plans
          </button>
        </form>
        <Link className="button secondary-button" href="/app/calendar">
          <CalendarDays size={16} /> Calendar
        </Link>
        <Link className="button secondary-button" href="/app/review">
          <FileText size={16} /> Review
        </Link>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><BadgeDollarSign size={18} /> Advertising promotions</h2>
            <p className="muted">Record an offer once. Ferocity compares the credit with planned and required spend, tracks deadlines, and keeps launch behind provider readiness and a separate final authorization.</p>
          </div>
          <span className="pill">no automatic spend</span>
        </div>
        <form action={captureProviderPromotionAction} className="panel form-stack">
          <div className="form-grid three">
            <label>Provider
              <select name="providerKey" defaultValue="google_ads">
                <option value="google_ads">Google Ads / YouTube</option>
                <option value="meta_ads">Meta / Facebook</option>
                <option value="microsoft_ads">Microsoft Ads</option>
                <option value="reddit_ads">Reddit Ads</option>
                <option value="tiktok_ads">TikTok Ads</option>
              </select>
            </label>
            <label>Who pays the provider
              <select name="laneKey" defaultValue="customer_owned">
                <option value="customer_owned">My connected ad account</option>
                <option value="ferocity_managed">Ferocity-managed budget</option>
              </select>
            </label>
            <label>Where the offer appeared
              <select name="offerSource" defaultValue="business_profile">
                <option value="business_profile">Business Profile setup</option>
                <option value="provider_dashboard">Provider dashboard</option>
                <option value="email">Email</option>
                <option value="representative">Provider representative</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label>Offer name<input name="title" placeholder="Google Ads new advertiser credit" required /></label>
          <div className="form-grid three">
            <label>Credit offered ($)<input name="creditAmount" type="number" min="0.01" step="0.01" required /></label>
            <label>Spend required ($)<input name="requiredSpendAmount" type="number" min="0.01" step="0.01" required /></label>
            <label>Already-planned ad spend ($)<input name="plannedSpendAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
          </div>
          <div className="form-grid three">
            <label>Claim by<input name="claimDeadline" type="date" /></label>
            <label>Qualifying spend due<input name="qualifyingPeriodEndsAt" type="date" /></label>
            <label>Credit expires<input name="creditExpiresAt" type="date" /></label>
          </div>
          <label>Offer URL<input name="offerUrl" type="url" placeholder="https://..." /></label>
          <label className="checkbox-row"><input name="newAccountOnly" type="checkbox" /><span>Offer says it is limited to new advertisers</span></label>
          <label>Important terms<textarea name="termsSummary" rows={3} placeholder="Paste the eligibility, required spend, timing, and redemption terms." /></label>
          <button className="button" type="submit">Analyze promotion</button>
        </form>

        <div className="grid">
          {promotions.map((promotion) => (
            <article className="panel span-6 form-stack" key={promotion.id}>
              <div className="list-row flush-row">
                <div><h3>{promotion.title}</h3><p className="muted">{promotion.providerKey.replaceAll("_", " ")} / {promotion.laneKey.replaceAll("_", " ")}</p></div>
                <span className={`pill ${promotion.recommendation === "skip" ? "high" : promotion.recommendation === "review" ? "medium" : ""}`}>{promotion.recommendation}</span>
              </div>
              <p>{promotion.recommendationReason}</p>
              <div className="form-grid three">
                <Metric label="Credit" value={dollars(promotion.creditCents)} />
                <Metric label="Required spend" value={dollars(promotion.requiredSpendCents)} />
                <Metric label="Unplanned spend" value={dollars(promotion.analysis.incrementalSpendCents)} />
                <Metric label="Progress" value={`${promotion.analysis.progressPercent}%`} />
                <Metric label="Needed per day" value={dollars(promotion.analysis.requiredDailySpendCents)} />
                <Metric label="Days remaining" value={promotion.analysis.daysRemaining === null ? "not recorded" : String(promotion.analysis.daysRemaining)} />
              </div>
              <p className="muted"><ShieldCheck size={15} /> Status: {promotion.status}. Recording or approving this offer does not create a campaign or enable live spending.</p>
              {promotion.status === "recommended" && promotion.recommendation !== "skip" ? (
                <form action={approveProviderPromotionAction} className="form-stack">
                  <input name="promotionId" type="hidden" value={promotion.id} />
                  <p className="muted">Ferocity will apply conservative campaign safeguards automatically. You can add your own limits now or later.</p>
                  <details className="subtle-panel">
                    <summary>Optional spending limits</summary>
                    <div className="form-grid two section-actions">
                      <label>My total limit ($)<input name="customBudgetAmount" type="number" min={promotion.requiredSpendCents / 100} step="0.01" placeholder="Use automatic safeguard" /></label>
                      <label>My daily limit ($)<input name="customDailyLimitAmount" type="number" min="0.01" step="0.01" placeholder="Use automatic safeguard" /></label>
                    </div>
                    <p className="muted">Leave these blank—or clear them—to use Ferocity&apos;s automatic safeguards. Live spending still requires separate campaign authorization.</p>
                  </details>
                  <div className="inline-actions">
                    <button className="mini-button" type="submit">Approve offer plan</button>
                    <button className="mini-button" formAction={declineProviderPromotionAction} type="submit">Skip offer</button>
                  </div>
                </form>
              ) : promotion.status === "recommended" ? (
                <form action={declineProviderPromotionAction}>
                  <input name="promotionId" type="hidden" value={promotion.id} />
                  <button className="mini-button" type="submit">Dismiss offer</button>
                </form>
              ) : null}
              {["approved", "activated", "qualified"].includes(promotion.status) ? (
                <form action={recordProviderPromotionProgressAction} className="form-grid two">
                  <input name="promotionId" type="hidden" value={promotion.id} />
                  <label>Cumulative qualifying spend ($)<input name="qualifyingSpendAmount" type="number" min="0" step="0.01" defaultValue={promotion.qualifyingSpendRecordedCents / 100} required /></label>
                  <button className="mini-button" type="submit">Update progress</button>
                </form>
              ) : null}
            </article>
          ))}
          {promotions.length === 0 ? <p className="muted">No advertising promotion has been recorded for this workspace.</p> : null}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Managed Growth Services</h2>
            <p className="muted">
              For businesses that do not want to connect every tool themselves. Ferocity can plan and prepare SEO, ads, reviews, content, and follow-up
              using managed controls. Live spend, publishing, and sends stay off until approved.
            </p>
          </div>
          <span className="pill">approval required</span>
        </div>
        <div className="grid">
          {[
            ["managed_local_seo", "Managed Local SEO", "Service pages, city pages, GBP ideas, authority tasks, and source tracking."],
            ["managed_ads", "Managed Ads", "Campaign setup, creative drafts, budget guardrails, source tracking, and ROI review."],
            ["managed_creative", "Managed Ad Creative", "Photo ads, review graphics, before/after posts, short video scripts, shot lists, and reusable campaign assets."],
            ["managed_video_ads", "Managed Video Ads", "Video strategy, hooks, scripts, shot lists, provider-ready briefs, variant ideas, and rendered-video add-on planning."],
            ["managed_review_growth", "Managed Review Growth", "Review asks, proof capture, testimonial reuse, and reputation follow-up."],
            ["managed_content", "Managed Content", "Posts, emails, offers, job stories, proof galleries, and campaign calendar drafts."],
            ["managed_email_followup", "Managed Email Follow-Up", "Lead nurture, stale lead recovery, estimate follow-up, and customer reactivation drafts."]
          ].map(([serviceKey, title, detail]) => (
            <section className="panel span-4" key={serviceKey}>
              <h3>{title}</h3>
              <p className="muted">{detail}</p>
              <form action={requestManagedMarketingServiceAction} className="stacked-form">
                <input name="serviceKey" type="hidden" value={serviceKey} />
                <label>
                  Monthly budget or service cap
                  <select name="monthlyBudgetCents" defaultValue="50000">
                    <option value="0">Plan only for now</option>
                    <option value="10000">$100/mo</option>
                    <option value="25000">$250/mo</option>
                    <option value="50000">$500/mo</option>
                    <option value="100000">$1,000/mo</option>
                    <option value="250000">$2,500/mo</option>
                  </select>
                </label>
                <label>
                  Notes
                  <input name="notes" placeholder="What should Ferocity focus on?" />
                </label>
                <button className="mini-button" type="submit">Request managed setup</button>
              </form>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Managed Service Status</h2>
            <p className="muted">Requested or active managed programs for this workspace. These are service controls, not hidden ad spend.</p>
          </div>
          <span className="pill">{managedRows.length} program(s)</span>
        </div>
        <ul className="list">
          {managedRows.map((program) => (
            <li className="list-row" key={program.id}>
              <div>
                <h3>{program.service_name}</h3>
                <p className="muted">
                  {program.service_family} / budget {dollars(program.monthly_budget_cents)} / management target {program.management_fee_bps / 100}%
                </p>
                <p className="muted">
                  Spend {program.live_spend_enabled ? "enabled" : "off"} / publishing {program.live_publishing_enabled ? "enabled" : "off"} / {program.approval_mode.replaceAll("_", " ")}
                </p>
              </div>
              <span className={`pill ${program.status === "requested" ? "medium" : ""}`}>{program.status}</span>
            </li>
          ))}
          {managedRows.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No managed services requested yet</h3>
                <p className="muted">Request a program above when the business wants Ferocity to manage the work instead of only guiding it.</p>
              </div>
            </li>
          ) : null}
        </ul>
      </section>

      <ul className="list">
        {plans.map((plan) => (
          <li className="list-row" key={plan.id}>
            <div>
              <h3>{plan.brandName}</h3>
              <p className="muted">{plan.summary}</p>
            </div>
            <div className="inline-actions">
              <span className="pill">{plan.periodKey}</span>
              <span className="pill">{plan.status}</span>
            </div>
          </li>
        ))}
        {plans.length === 0 ? (
          <li className="list-row">
            <div>
              <h3>No weekly plans yet</h3>
              <p className="muted">Generate plans to create draft content, recommendations, and upcoming calendar items.</p>
            </div>
          </li>
        ) : null}
      </ul>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="preview-metric"><span>{label}</span><strong>{value}</strong></div>;
}
