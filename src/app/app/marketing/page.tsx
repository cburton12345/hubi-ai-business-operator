import Link from "next/link";
import { CalendarDays, FileText, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getMarketingPlanRows } from "@/lib/marketing/get-phase2-dashboard";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { generateWeeklyMarketingPlansAction, requestManagedMarketingServiceAction } from "./actions";

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function MarketingOperatorPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const [plans, managedPrograms] = await Promise.all([
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
    )
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
