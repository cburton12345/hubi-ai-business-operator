import Link from "next/link";
import { ArrowRight, CheckCircle2, Gauge, ShieldCheck, Sparkles } from "lucide-react";

const industries = [
  "Roofing",
  "Remodeling",
  "Landscaping",
  "HVAC",
  "Electrical",
  "Plumbing",
  "Cleaning",
  "Property Management",
  "Landlord",
  "Local Service Business",
  "Small Business"
];

const answerOptions = [
  ["strong", "Strong system"],
  ["some", "Somewhat / manual"],
  ["missing", "No clear system"],
  ["not_sure", "Not sure"]
];

export default async function WebsiteGraderPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

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
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Ferocity Business Health Score</p>
          <h1>Find the weak spots holding the business back.</h1>
          <p className="muted">
            Get a free score for marketing, lead capture, website, reviews, SEO, automation, operations, retention,
            hiring, and growth potential. No credit card required.
          </p>
        </section>

        <section className="start-grid">
          <form action="/api/website-grader" method="post" className="panel form-stack span-7">
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div>
              <p className="eyebrow">Free lead-generation audit</p>
              <h2>Analyze my business</h2>
              <p className="muted">
                The score is rules-based for consistency. Ferocity uses the result to explain weaknesses, estimate
                opportunities, and show what to fix first.
              </p>
            </div>
            {params.error ? <p className="form-error">Please enter a valid email and valid URLs if you include them.</p> : null}

            <label>
              Business name
              <input name="companyName" placeholder="Acme Roofing" autoComplete="organization" required />
            </label>
            <div className="two-col">
              <label>
                Industry
                <select name="businessType" defaultValue="Roofing">
                  {industries.map((industry) => (
                    <option value={industry} key={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Email
                <input name="email" type="email" placeholder="you@company.com" required />
              </label>
            </div>
            <div className="two-col">
              <label>
                City
                <input name="city" placeholder="Eau Claire" autoComplete="address-level2" />
              </label>
              <label>
                State
                <input name="state" placeholder="WI" autoComplete="address-level1" />
              </label>
            </div>
            <label>
              Website URL <span className="muted">optional</span>
              <input name="websiteUrl" type="url" placeholder="https://example.com" />
            </label>
            <label>
              Google Business Profile URL <span className="muted">optional</span>
              <input name="googleBusinessProfileUrl" type="url" placeholder="https://maps.google.com/..." />
            </label>

            <div>
              <p className="eyebrow">Quick operations check</p>
              <p className="muted">Pick the closest answer. Not sure is okay.</p>
            </div>
            <div className="two-col">
              <SelectField name="leadResponse" label="New lead response" />
              <SelectField name="followUp" label="Follow-up after leads or estimates" />
            </div>
            <div className="two-col">
              <SelectField name="reviews" label="Reviews and customer proof" />
              <SelectField name="payments" label="Invoices and payment follow-up" />
            </div>
            <div className="two-col">
              <SelectField name="operations" label="Jobs, tasks, and customer history" />
              <SelectField name="hiring" label="Hiring, crews, or subcontractors" />
            </div>
            <SelectField name="retention" label="Customer retention and repeat work" />

            <div>
              <p className="eyebrow">Current lead sources</p>
              <div className="checkbox-grid">
                {[
                  ["website", "Website"],
                  ["local_seo", "Local SEO"],
                  ["google_maps", "Google Maps"],
                  ["reviews", "Reviews"],
                  ["facebook", "Facebook"],
                  ["paid_ads", "Paid ads"],
                  ["referrals", "Referrals"],
                  ["marketplacepro", "MarketplacePro"]
                ].map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input name="marketingChannels" type="checkbox" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about this score and setup. This does not turn on customer messaging.</span>
            </label>
            <button className="button" type="submit">
              Analyze My Business <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What the score includes</p>
            <div className="stacked-list">
              {[
                "Overall Business Health Score from 0-100",
                "Category scores for marketing, leads, website, reviews, SEO, automation, operations, retention, hiring, and growth",
                "Strengths and weaknesses in plain English",
                "Realistic opportunity estimates, not guaranteed claims",
                "Recommended Ferocity actions and ecosystem next steps",
                "AI Growth Report path: buy once or get it with Starter and higher"
              ].map((item) => (
                <div className="list-row flush-row" key={item}>
                  <span>{item}</span>
                  <CheckCircle2 size={18} />
                </div>
              ))}
            </div>
            <div className="notice-card">
              <Gauge size={20} />
              <div>
                <strong>Immediate value</strong>
                <p className="muted">Users get a useful score and top fixes before buying anything.</p>
              </div>
            </div>
            <div className="notice-card">
              <Sparkles size={20} />
              <div>
                <strong>AI-ready</strong>
                <p className="muted">Rules keep the score consistent. AI can later explain and personalize the plan.</p>
              </div>
            </div>
            <div className="notice-card">
              <ShieldCheck size={20} />
              <div>
                <strong>Safe by default</strong>
                <p className="muted">No SEO pages, emails, ads, SMS, payments, or website changes go live from this score.</p>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

function SelectField({ name, label }: { name: string; label: string }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue="not_sure">
        {answerOptions.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
