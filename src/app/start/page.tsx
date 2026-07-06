import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

const goals = [
  ["find_gaps", "Tell me what is missing"],
  ["make_more_money", "Grow booked income"],
  ["seo_reviews", "Get more leads with SEO and reviews"],
  ["fast_lead_response", "Improve lead response and stale lead follow-up"],
  ["operations", "Organize jobs, estimates, invoices, and tasks"],
  ["not_sure", "I am not sure yet"]
];

const autopilotOptions = [
  ["owner_briefing", "Tell me what needs attention"],
  ["lead_follow_up", "Lead replies and follow-up"],
  ["estimate_chasing", "Estimate follow-up"],
  ["invoice_collection", "Invoice reminders and money tracking"],
  ["jobs_tasks", "Jobs, tasks, and worker day plans"],
  ["reviews_proof", "Reviews, testimonials, and customer proof"],
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
  ["publish_to_existing_site", "Publish approved SEO/content to my site"],
  ["marketplace", "Connect marketplace or partner leads"]
];

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; source?: string; plan?: string; billing?: string }>;
}) {
  const params = await searchParams;
  const plan = ["free", "job_tracker", "starter", "growth", "operator", "pro_agency"].includes(params.plan ?? "") ? params.plan : "not_sure";
  const billingMessage =
    params.billing === "free_plan"
      ? "Free starts with bounded lead capture, source tracking, and manual work. Paid plans unlock higher usage, automations, payments, and integrations."
      : params.billing === "stripe_not_ready"
      ? "Your setup request will save the selected plan. Ferocity will confirm checkout before any billing starts."
      : params.billing === "manual_plan"
        ? "This plan needs a manual setup conversation before checkout."
        : params.billing === "stripe_error"
          ? "Checkout was not available, so Ferocity is saving this as a setup request."
          : null;

  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/connect-website">Connect Website</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/install">Install App</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Start your AI autopilot</p>
          <h1>Tell Ferocity what is eating your time.</h1>
          <p className="muted">
            Share the basics, choose what AI should help run, and Ferocity builds the first operating plan. It can start with recommendations,
            then move into approved follow-up, jobs, payments, reviews, marketing, and daily owner alerts when the business is ready.
            The goal is less stress, fewer missed things, and more control over the day.
          </p>
          <div className="button-row">
            <Link className="button" href="/business-health-score">
              Run free grader first
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Compare plans
            </Link>
            <Link className="button secondary-button" href="/connect-website">
              Connect website
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
          </div>
        </section>

        <section className="start-grid">
          <form action="/api/access-requests" method="post" className="panel form-stack span-7">
            <input name="sourceDetail" type="hidden" value={params.source ?? "start_page"} />
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>

            <div>
              <p className="eyebrow">AI setup request</p>
              <h2>Give Ferocity enough context to build the first relief plan.</h2>
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
              Your name
              <input name="name" autoComplete="name" />
            </label>
            <label>
              Work email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              Company
              <input name="companyName" autoComplete="organization" />
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
              How should Ferocity connect to the website?
              <select name="websiteConnectionPlan" defaultValue="not_sure">
                {websiteConnectionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
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
            <fieldset className="form-fieldset">
              <legend>What should AI help run?</legend>
              <p className="muted">Pick the parts you want Ferocity to watch, prepare, remind, or help automate.</p>
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
              How much should AI do at first?
              <select name="autonomyMode" defaultValue="approval_first">
                <option value="recommend_only">Recommend only</option>
                <option value="approval_first">Prepare work, ask before messages or public changes</option>
                <option value="low_risk_auto">Handle low-risk repeat work after setup</option>
                <option value="not_sure">Help me choose</option>
              </select>
            </label>
            <fieldset className="form-fieldset">
              <legend>Where do leads come from now?</legend>
              <p className="muted">Ferocity uses this to set up source tracking, follow-up, and reporting.</p>
              <div className="checkbox-grid">
                {leadSourceOptions.map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input name="leadSources" type="checkbox" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Plan you think fits
              <select name="requestedPlan" defaultValue={plan}>
                <option value="not_sure">Not sure yet</option>
                <option value="free">Free</option>
                <option value="job_tracker">Job Tracker</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="operator">Operator</option>
                <option value="pro_agency">Pro / Agency</option>
              </select>
            </label>
            <label>
              Anything Ferocity should know?
              <textarea
                name="message"
                rows={5}
                placeholder="Example: We are a roofing company in Eau Claire. We want more storm jobs, faster follow-up, more reviews, and better tracking."
              />
            </label>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about setup and access. This form does not turn on customer messaging.</span>
            </label>
            <label className="checkbox-row">
              <input name="createWorkspace" type="checkbox" defaultChecked />
              <span>Create a starter business account and send me an invite link if I am eligible.</span>
            </label>
            <button className="button" type="submit">
              Build my first plan <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What happens next</p>
            <div className="stacked-list">
              {[
                "Ferocity looks for the highest-value next steps first: missed leads, poor website conversion, aging estimates, missing reviews, unpaid invoices, unclear lead sources, and work that keeps pulling the owner back in.",
                "You choose what AI helps with first. Ferocity can start with recommendations, ask for review before important actions, or help handle safe repeat work later.",
                "The website connection plan shows the practical next step: quote link, embedded form, hosted page, approved SEO publishing, or marketplace source.",
                "Lead sources are mapped so forms, SEO, ads, reviews, calls, referrals, and partner sources can be tied to jobs and revenue.",
                "If selected, Ferocity creates a private trial account and owner invite link.",
                "Customer messages, publishing, ad changes, and billing actions stay under your control.",
                "The public demo stays public. The real dashboard stays private."
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
      </section>
    </main>
  );
}
