import Link from "next/link";
import { CalendarDays, FileText, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketingPlanRows } from "@/lib/marketing/get-phase2-dashboard";
import { generateWeeklyMarketingPlansAction } from "./actions";

export default async function MarketingOperatorPage() {
  const plans = await getMarketingPlanRows();

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
