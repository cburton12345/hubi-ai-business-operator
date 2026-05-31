import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

const goals = [
  ["seo_reviews", "Get more leads with SEO and reviews"],
  ["fast_lead_response", "Respond faster and recover stale leads"],
  ["automations", "Set up follow-up automations"],
  ["operations", "Organize jobs, estimates, invoices, and tasks"],
  ["not_sure", "I am not sure yet"]
];

const leadSourceOptions = [
  ["website_form", "Website forms"],
  ["hosted_pages", "Ferocity hosted pages"],
  ["local_seo", "Local SEO / city pages"],
  ["google_business_profile", "Google Business Profile"],
  ["reviews", "Reviews"],
  ["facebook", "Facebook / community groups"],
  ["paid_ads", "Paid ads"],
  ["marketplacepro", "MarketplacePro"],
  ["phone_calls", "Phone calls"],
  ["manual_referrals", "Referrals / manual leads"]
];

const websiteConnectionOptions = [
  ["not_sure", "Not sure yet"],
  ["add_quote_link", "Add a quote link or button"],
  ["embed_form", "Embed a Ferocity form"],
  ["hosted_pages", "Use Ferocity hosted pages"],
  ["publish_to_existing_site", "Publish approved SEO/content to my site"],
  ["marketplacepro", "Connect MarketplacePro leads"]
];

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; source?: string; plan?: string; billing?: string }>;
}) {
  const params = await searchParams;
  const plan = ["free", "starter", "growth", "operator", "pro_agency"].includes(params.plan ?? "") ? params.plan : "not_sure";
  const billingMessage =
    params.billing === "free_plan"
      ? "Free starts with bounded lead capture, source tracking, and manual work. Paid plans unlock higher usage, automations, payments, and integrations."
      : params.billing === "stripe_not_ready"
      ? "Online checkout is not available for this plan yet. Your request will save the selected plan for setup."
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
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Start with Ferocity</p>
          <h1>Tell us what you want Ferocity to set up.</h1>
          <p className="muted">
            Tell us about the business, the work you want organized first, and the plan that seems closest. Customer messages,
            publishing, ad changes, and billing actions are not turned on from this form.
          </p>
          <div className="button-row">
            <Link className="button secondary-button" href="/demo/tour">
              Take the tour first
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View tiers
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
              <p className="eyebrow">Request access</p>
              <h2>Business details</h2>
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
              Main goal
              <select name="mainGoal" defaultValue="seo_reviews">
                {goals.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
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
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="operator">Operator</option>
                <option value="pro_agency">Pro / Agency</option>
              </select>
            </label>
            <label>
              What do you want Ferocity to help with first?
              <textarea
                name="message"
                rows={5}
                placeholder="Example: I run a roofing company and want storm leads, review requests, SEO pages, and fast follow-up."
              />
            </label>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about setup and access. This form does not turn on customer messaging.</span>
            </label>
            <label className="checkbox-row">
              <input name="createWorkspace" type="checkbox" defaultChecked />
              <span>Create a starter workspace and send me an invite link.</span>
            </label>
            <button className="button" type="submit">
              Request access <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What happens next</p>
            <div className="stacked-list">
              {[
                "Free can start with a small lead capture workspace. Paid tiers unlock higher usage, automations, payments, and integrations.",
                "The website connection plan shows what to add: quote link, embedded form, hosted page, approved SEO publishing, or MarketplacePro source.",
                "Lead sources are mapped so forms, SEO, ads, reviews, calls, and MarketplacePro can be tracked.",
                "If selected, Ferocity creates a locked trial workspace and owner invite link.",
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
