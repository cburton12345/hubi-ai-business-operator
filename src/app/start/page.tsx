import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { publicEarnPlan } from "@/lib/billing/public-plans";

export const metadata: Metadata = {
  title: "Start Ferocity",
  description: "Tell Ferocity what your business needs and choose the simplest path to start moving work forward.",
  alternates: { canonical: "/start" }
};

const goals = [
  ["find_gaps", "Tell me what is missing"],
  ["make_more_money", "Grow booked income"],
  ["seo_reviews", "Get more leads with SEO and reviews"],
  ["fast_lead_response", "Improve lead response and old-lead follow-up"],
  ["operations", "Organize jobs, estimates, invoices, and tasks"],
  ["not_sure", "I am not sure yet"]
];

const autopilotOptions = [
  ["daily_briefing", "Tell me what needs attention"],
  ["lead_follow_up", "Lead replies and follow-up"],
  ["estimate_follow_up", "Estimate follow-up"],
  ["invoice_collection", "Invoice reminders and money tracking"],
  ["jobs_tasks", "Jobs, tasks, and worker day plans"],
  ["reviews_trust", "Reviews, testimonials, and customer photos"],
  ["seo_marketing", "SEO, Google profile, and marketing drafts"],
  ["website_tracking", "Website tracking and quote forms"]
];

const leadSourceOptions = [
  ["website_form", "Website forms"],
  ["hosted_pages", "Ferocity hosted pages"],
  ["local_seo", "Local SEO / city pages"],
  ["google_business_profile", "Google Business Profile"],
  ["reviews", "Reviews"],
  ["facebook", "Facebook / community groups"],
  ["paid_ads", "Paid ads"],
  ["marketplace", "Marketplace / partner leads"],
  ["phone_calls", "Phone calls"],
  ["manual_referrals", "Referrals / manual leads"]
];

const websiteConnectionOptions = [
  ["not_sure", "Not sure yet"],
  ["add_quote_link", "Add a quote link or button"],
  ["embed_form", "Embed a Ferocity form"],
  ["hosted_pages", "Use Ferocity hosted pages"],
  ["publish_to_existing_site", "Prepare approved website/SEO updates"],
  ["marketplace", "Connect marketplace or partner leads"]
];

const setupPaths = [
  ["Take work off my plate", "Daily briefing, reminders, follow-up, tasks, jobs, and owner decisions."],
  ["Get more booked income", "Free audit, qualified funnel, SEO/GEO drafts, reviews, ads, video briefs, and tracking."],
  ["Organize jobs and money", "Bids, materials, receipts, invoices, payments, worker day plans, and profit view."],
  ["Start small", "Use Job Tracker for bids, materials, receipts, payments, reminders, and job profit."]
];

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; source?: string; plan?: string; billing?: string }>;
}) {
  const params = await searchParams;
  const plan = ["earn", "job_tracker", "starter", "growth", "operator", "pro_agency", "managed_operator"].includes(params.plan ?? "") ? params.plan : "not_sure";
  const billingMessage =
    params.billing === "stripe_not_ready"
      ? "Your setup request will save the selected plan. Ferocity will confirm checkout before any billing starts."
      : params.billing === "manual_plan"
        ? "This plan needs a manual setup conversation before checkout."
        : params.billing === "stripe_error"
          ? "Checkout was not available, so Ferocity is saving this as a setup request."
          : null;

  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">Start simple</p>
          <h1>Choose what you want Ferocity to help with first.</h1>
          <p className="muted">
            Pick a starting point. Detailed setup can wait until after your account is created.
          </p>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader first
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Compare plans
            </Link>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Choose a starting lane</p>
          <h2>Start with the outcome that matters most.</h2>
          <div className="value-ladder">
            {setupPaths.map(([title, body]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel feature-split" aria-label="Ferocity Earn starting option">
          <div>
            <p className="eyebrow">{publicEarnPlan.eyebrow}</p>
            <strong className="price-line">{publicEarnPlan.price}</strong>
            <h2>{publicEarnPlan.name}</h2>
            <p className="muted">{publicEarnPlan.fit} {publicEarnPlan.rates}</p>
          </div>
          <div>
            <p className="muted">{publicEarnPlan.eligibility} {publicEarnPlan.costs}</p>
            <Link className="button" href="/start?source=start_earn&plan=earn#start-request">
              Choose Ferocity Earn
            </Link>
          </div>
        </section>

        <section className="start-grid">
          <form action="/api/access-requests" method="post" className="panel form-stack span-7" id="start-request">
            <input name="sourceDetail" type="hidden" value={params.source ?? "start_page"} />
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>

            <div>
              <p className="eyebrow">AI setup request</p>
              <h2>Tell us where to create your workspace.</h2>
              <p className="muted">Only your email and consent are required.</p>
            </div>

            {params.error ? (
              <p className="form-error">
                {params.error === "save"
                  ? "We could not save this request. Please try again."
                  : "Please check the required fields and try again."}
              </p>
            ) : null}
            {billingMessage ? <p className="success-panel">{billingMessage}</p> : null}

            <label>
              Work email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Company
              <input name="companyName" autoComplete="organization" />
            </label>
            <details className="plan-feature-details">
              <summary>Add business and website details (optional)</summary>
              <div className="form-stack">
            <label>
              Your name
              <input name="name" autoComplete="name" />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              Business type
              <input name="businessType" placeholder="Roofing, trailer rentals, cleaning, HVAC, software..." />
            </label>
            <label>
              Website
              <input name="websiteUrl" type="url" placeholder="https://example.com" />
            </label>
            <label>
              Website setup preference
              <select name="websiteConnectionPlan" defaultValue="not_sure">
                {websiteConnectionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
              </div>
            </details>
            <label>
              Biggest outcome wanted first
              <select name="mainGoal" defaultValue="find_gaps">
                {goals.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <details className="plan-feature-details">
              <summary>Personalize automation and lead setup (optional)</summary>
              <div className="form-stack">
            <fieldset className="form-fieldset">
              <legend>Where do you want relief first?</legend>
              <p className="muted">Pick the areas you want Ferocity to watch, prepare, remind, or help organize.</p>
              <div className="checkbox-grid">
                {autopilotOptions.map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input name="autopilotAreas" type="checkbox" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              How much should Ferocity do at first?
              <select name="autonomyMode" defaultValue="low_risk_auto">
                <option value="low_risk_auto">Handle safe repeat work after setup (Recommended)</option>
                <option value="approval_first">Prepare the work, ask before anything important</option>
                <option value="recommend_only">Just recommend the next steps</option>
                <option value="not_sure">Help me choose</option>
              </select>
            </label>
            <fieldset className="form-fieldset">
              <legend>Where do leads come from now?</legend>
              <p className="muted">Ferocity uses this to set up lead-source tracking, follow-up, and reporting.</p>
              <div className="checkbox-grid">
                {leadSourceOptions.map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input name="leadSources" type="checkbox" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
              </div>
            </details>
            <label>
              Plan you think fits
              <select name="requestedPlan" defaultValue={plan}>
                <option value="not_sure">Not sure yet</option>
                <option value="earn">Ferocity Earn — $0/month base</option>
                <option value="job_tracker">Job Tracker</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="operator">Operator</option>
                <option value="pro_agency">Pro / Agency</option>
                <option value="managed_operator">Managed Operator</option>
              </select>
            </label>
            <details className="plan-feature-details">
              <summary>Add a note (optional)</summary>
              <label>
                Anything else Ferocity needs to know?
                <textarea
                  name="message"
                  rows={4}
                  placeholder="What would make Ferocity most useful to your business?"
                />
              </label>
            </details>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about setup and access. This form does not turn on customer messaging.</span>
            </label>
            <button className="button" type="submit">
              Continue <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What happens next</p>
            <div className="stacked-list">
              {[
                "Ferocity creates the right starting plan from the few answers above.",
                "Self-serve plans continue to secure checkout; custom requests receive a setup review.",
                "Detailed integrations, AI authority, and provider choices are handled during guided setup."
              ].map((item) => (
                <div className="list-row flush-row" key={item}>
                  <span>{item}</span>
                  <CheckCircle2 size={18} />
                </div>
              ))}
            </div>
            <div className="notice-card">
              <ShieldCheck size={20} />
              <div>
                <strong>Safe launch mode</strong>
                <p className="muted">
                  This form starts the setup request. It does not send customer messages, publish content, change ads, or start billing.
                </p>
              </div>
            </div>
          </aside>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
