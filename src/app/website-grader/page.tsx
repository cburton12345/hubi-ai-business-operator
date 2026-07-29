import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Gauge, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Free Business Grader for Growth-Focused Businesses",
  description:
    "Get a free Ferocity Business Grader report for website conversion, SEO, lead capture, reviews, automation readiness, and growth opportunities.",
  alternates: {
    canonical: "/business-health-score"
  }
};

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
  "Law Firm",
  "Chiropractor",
  "E-commerce",
  "Sales Team",
  "Clinic",
  "Agency",
  "Local Business",
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
          <p className="eyebrow">Ferocity Business Grader</p>
          <h1>Find the first places Ferocity can make the business easier to run and easier to grow.</h1>
          <p className="muted">
            Run a free audit that scores the business, highlights useful improvements, and shows the first actions Ferocity would recommend.
            No credit card required.
          </p>
        </section>

        <section className="start-grid">
          <form action="/api/website-grader" method="post" className="panel form-stack span-7">
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div>
              <p className="eyebrow">Free Business Grader</p>
              <h2>Analyze my business</h2>
              <p className="muted">
                Use normal business details. Ferocity turns them into a Business Health Score, improvement areas,
                and a practical setup path. It works for contractors, local companies, professional practices,
                sales teams, agencies, e-commerce, rentals, and owners with one business or several.
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
              Service area
              <input name="serviceArea" placeholder="Eau Claire, Chippewa Falls, Altoona, and nearby towns" />
            </label>
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
                  ["marketplace", "Marketplace / partner sources"]
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
              <span>I agree Ferocity can contact me about this grader report and setup. This does not turn on customer messaging.</span>
            </label>
            <button className="button" type="submit">
              Grade My Business <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What the score includes</p>
            <div className="stacked-list">
              {[
                "Overall Business Health Score from 0-100",
                "Category scores for website, SEO, Google profile, lead capture, reputation, and automation readiness",
                "Strengths and weaknesses in plain English",
                "Revenue opportunities to review",
                "Top 5 ROI-ranked actions with impact, difficulty, ROI, and time estimate",
                "Which Ferocity plan or workflow would fix each gap",
                "A clear path into AI-guided setup",
                "Business Autopilot Blueprint path for paid plans"
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
                <p className="muted">Get a useful score and top recommendations before buying anything.</p>
              </div>
            </div>
            <div className="notice-card">
              <Sparkles size={20} />
              <div>
                <strong>AI-ready</strong>
                <p className="muted">AI can explain the gaps and personalize the plan.</p>
              </div>
            </div>
            <div className="notice-card">
              <ShieldCheck size={20} />
              <div>
                <strong>Safe by default</strong>
                <p className="muted">No SEO pages, emails, ads, payments, or website changes go live from this score.</p>
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
