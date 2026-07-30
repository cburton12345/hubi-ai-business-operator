import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Gauge,
  Megaphone,
  MousePointerClick,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target
} from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "Ferocity Growth System | Free Business Audit",
  description:
    "Run a free Ferocity business audit, see what is costing leads or booked income, then start a guided setup path for follow-up, reviews, marketing, payments, and operations.",
  alternates: { canonical: "/growth-system" }
};

const funnelSteps = [
  {
    title: "Find the opportunity",
    body: "Run the free audit or start from a business goal. Ferocity identifies the gaps most likely to cost leads, time, or money.",
    icon: Gauge
  },
  {
    title: "Build the funnel",
    body: "Create a simple offer, page, quiz, or audit path that qualifies people before they reach your calendar or inbox.",
    icon: ClipboardCheck
  },
  {
    title: "Follow up automatically",
    body: "Prepare replies, reminders, nurture steps, review asks, and payment follow-up so good opportunities do not vanish.",
    icon: CalendarCheck
  },
  {
    title: "Improve with real data",
    body: "Track which source, offer, page, follow-up, estimate, job, invoice, and review turns attention into booked income.",
    icon: Target
  }
];

const funnelProof = [
  ["Qualified lead data", "Send clean signals back into ads, SEO, and follow-up decisions."],
  ["Short proof videos", "Use fast clips, testimonials, before/after proof, and clear offers instead of long lectures."],
  ["Show-up support", "Confirm, remind, and nurture leads so booked calls or jobs do not quietly fall apart."],
  ["Revenue tracking", "Measure booked work and payments, not just clicks, views, or form fills."]
];

const outcomes = [
  ["Respond faster", "Stop losing leads because nobody replied soon enough."],
  ["Follow up longer", "Keep old leads, viewed estimates, and unpaid invoices from disappearing."],
  ["Get more proof", "Turn reviews, photos, testimonials, and completed work into useful marketing."],
  ["Track what works", "Tie sources, pages, campaigns, leads, jobs, invoices, and revenue together."],
  ["Run the day", "See what needs attention, what AI prepared, and what decisions matter now."],
  ["Stay in control", "Messages, posts, ads, payment requests, and publishing follow approval rules."]
];

const fitOptions = [
  "Local service business",
  "Contractor or trade",
  "Professional practice",
  "Agency or sales team",
  "Rental or property business",
  "E-commerce or online seller",
  "Multi-business owner",
  "Not sure yet"
];

const bottlenecks = [
  ["lead_response", "Leads are not answered fast enough"],
  ["follow_up", "Follow-up is inconsistent"],
  ["seo_reviews", "SEO, reviews, or marketing are weak"],
  ["payments", "Invoices, payments, or collections are messy"],
  ["jobs_team", "Jobs, workers, receipts, or daily tasks are scattered"],
  ["visibility", "I do not know what needs attention each day"]
];

const plans = [
  ["not_sure", "Not sure yet"],
  ["free", "Start free"],
  ["job_tracker", "Job Tracker"],
  ["starter", "Starter"],
  ["growth", "Growth"],
  ["operator", "Operator"],
  ["pro_agency", "Pro / Agency"]
];

export default function GrowthSystemPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="hero-command">
          <div className="hero-copy">
            <p className="eyebrow">Free business audit + setup funnel</p>
            <h1>Generate qualified leads, then let Ferocity help turn them into booked income.</h1>
            <p>
              Start with a free audit or a simple offer. Ferocity helps build the funnel, qualify the lead,
              follow up, and track which marketing turns into real work and paid revenue.
            </p>
            <div className="button-row">
              <Link className="button" href="/business-health-score?source=growth_system">
                Run free audit <ArrowRight size={16} />
              </Link>
              <a className="button secondary-button" href="#watch">
                Watch short demo
              </a>
              <a className="button secondary-button" href="#qualify">
                Request setup
              </a>
            </div>
          </div>

          <div className="product-console funnel-score-card" aria-label="Ferocity funnel preview">
            <div className="console-topbar">
              <div>
                <span className="eyebrow">Sample funnel</span>
                <strong>Audit to setup path</strong>
              </div>
              <span className="live-pill">Example</span>
            </div>
            <div className="preview-metrics console-metrics">
              <div className="preview-metric tone-hot"><span>Score</span><strong>62</strong><small>needs work</small></div>
              <div className="preview-metric tone-money"><span>Leaks</span><strong>5</strong><small>high value</small></div>
              <div className="preview-metric tone-draft"><span>Actions</span><strong>Top 5</strong><small>ranked</small></div>
              <div className="preview-metric tone-trust"><span>Path</span><strong>Growth</strong><small>recommended</small></div>
            </div>
            <div className="demo-alert-list">
              <div>
                <MousePointerClick size={16} />
                <strong>Lead capture</strong>
                <span>Quote forms and source tracking need work.</span>
                <em>Fix first</em>
              </div>
              <div>
                <Megaphone size={16} />
                <strong>Growth</strong>
                <span>SEO, reviews, and proof can create more demand.</span>
                <em>Build plan</em>
              </div>
              <div>
                <DollarSign size={16} />
                <strong>Revenue</strong>
                <span>Follow-up and invoice reminders can protect cash.</span>
                <em>Queue work</em>
              </div>
            </div>
          </div>
        </section>

        <section className="funnel-strip" aria-label="Ferocity funnel steps">
          {funnelSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title}>
                <span>{index + 1}</span>
                <Icon size={18} />
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </article>
            );
          })}
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The outcome</p>
            <h2>A repeatable engine for better leads, better follow-up, and better decisions.</h2>
            <p>
              Ferocity is not trying to dump more names into a spreadsheet. The goal is qualified demand,
              faster response, cleaner handoff, and a feedback loop that shows what actually creates money.
            </p>
          </div>
          <div className="demo-proof-flow">
            {funnelProof.map(([title]) => (
              <span key={title}>{title}</span>
            ))}
          </div>
        </section>

        <section className="video-tour" id="watch">
          <div className="video-frame">
            <Image
              className="walkthrough-animation"
              src="/ferocity-demo-walkthrough.svg"
              width={1280}
              height={720}
              priority
              unoptimized
              alt="Ferocity walkthrough showing leads, estimates, invoices, reviews, marketing, and owner actions"
            />
          </div>
          <div className="video-copy">
            <p className="eyebrow">Short walkthrough</p>
            <h2>The audit is the start. The operating loop is the product.</h2>
            <p>
              Keep it quick. The job is to show the idea fast: Ferocity is not just a score. It helps turn the score into a working system:
              better lead response, stronger follow-up, clearer money tracking, more reviews, useful marketing, and fewer daily loose ends.
            </p>
            <Link className="button" href="/demo">
              Open full demo <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="public-grid">
          {[...funnelProof, ...outcomes].map(([title, body]) => (
            <article className="panel value-card" key={title}>
              <CheckCircle2 size={18} />
              <h2>{title}</h2>
              <p className="muted">{body}</p>
            </article>
          ))}
        </section>

        <section className="feature-split" id="qualify">
          <form action="/api/access-requests" method="post" className="panel form-stack">
            <input name="sourceDetail" type="hidden" value="growth_system_qualification" />
            <input name="mainGoal" type="hidden" value="make_more_money" />
            <input name="leadSources" type="hidden" value="website_form" />
            <input name="leadSources" type="hidden" value="local_seo" />
            <input name="leadSources" type="hidden" value="reviews" />
            <input name="autopilotAreas" type="hidden" value="daily_briefing" />
            <input name="autopilotAreas" type="hidden" value="lead_follow_up" />
            <input name="autopilotAreas" type="hidden" value="seo_marketing" />
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div>
              <p className="eyebrow">Qualification</p>
              <h2>Request the right Ferocity setup path.</h2>
              <p className="muted">Save the business details and setup request so Ferocity can follow up with the right next step.</p>
            </div>
            <label>
              Work email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <div className="two-col">
              <label>
                Your name
                <input name="name" autoComplete="name" />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" autoComplete="tel" />
              </label>
            </div>
            <label>
              How should routine work start?
              <select name="autonomyMode" defaultValue="low_risk_auto">
                <option value="low_risk_auto">Handle safe repeat work after setup</option>
                <option value="approval_first">Prepare it and ask me first</option>
                <option value="recommend_only">Recommend the next steps only</option>
                <option value="not_sure">Help me decide</option>
              </select>
            </label>
            <label>
              Business name
              <input name="companyName" autoComplete="organization" />
            </label>
            <div className="two-col">
              <label>
                Business type
                <select name="businessType" defaultValue="Local service business">
                  {fitOptions.map((fit) => (
                    <option value={fit} key={fit}>{fit}</option>
                  ))}
                </select>
              </label>
              <label>
                Plan interest
                <select name="requestedPlan" defaultValue="not_sure">
                  {plans.map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Website
              <input name="websiteUrl" type="url" placeholder="https://example.com" />
            </label>
            <fieldset className="form-fieldset">
              <legend>What feels most broken right now?</legend>
              <div className="checkbox-grid">
                {bottlenecks.map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input name="funnelBottlenecks" type="checkbox" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="two-col">
              <label>
                Current leads per month
                <select name="monthlyLeadVolume" defaultValue="not_sure">
                  <option value="not_sure">Not sure</option>
                  <option value="0_10">0-10</option>
                  <option value="10_40">10-40</option>
                  <option value="40_100">40-100</option>
                  <option value="100_plus">100+</option>
                </select>
              </label>
              <label>
                How soon do you want help?
                <select name="urgency" defaultValue="soon">
                  <option value="now">Now</option>
                  <option value="soon">Soon</option>
                  <option value="exploring">Just exploring</option>
                </select>
              </label>
            </div>
            <label>
              Best time to talk, if needed
              <input name="preferredCallWindow" placeholder="Weekdays after 3, mornings, email first..." />
            </label>
            <label>
              Anything Ferocity should know?
              <textarea
                name="message"
                rows={4}
                placeholder="Example: I want more booked jobs, better follow-up, and less time chasing daily work."
              />
            </label>
            <label className="checkbox-row">
              <input name="consentToContact" type="checkbox" required />
              <span>I agree Ferocity can contact me about the audit, setup, and plan options.</span>
            </label>
            <label className="checkbox-row">
              <input name="createWorkspace" type="checkbox" />
              <span>Create a starter business account if I am eligible.</span>
            </label>
            <button className="button" type="submit">
              Request setup path <ArrowRight size={16} />
            </button>
          </form>

          <aside className="panel">
            <p className="eyebrow">What happens after this</p>
            <div className="stacked-list">
              {[
                "Ferocity records the business type, source, bottlenecks, lead volume, urgency, and plan interest.",
                "The setup path starts with the highest-value problem first: leads, follow-up, reviews, marketing, payments, jobs, or daily visibility.",
                "If you run the free audit first, the score and recommendations carry the conversation.",
                "Messages, ads, public posts, publishing, and payment requests stay controlled by your setup rules."
              ].map((item) => (
                <div className="list-row flush-row" key={item}>
                  <span>{item}</span>
                  <ShieldCheck size={18} />
                </div>
              ))}
            </div>
            <div className="notice-card">
              <Sparkles size={20} />
              <div>
                <strong>Best first move</strong>
                <p className="muted">Run the free audit first if you want the cleanest, most useful setup path.</p>
                <Link className="mini-button" href="/business-health-score?source=growth_system_sidebar">
                  Run free audit
                </Link>
              </div>
            </div>
          </aside>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">Conversion feedback loop</p>
            <h2>Ferocity is designed to learn which leads turn into real money.</h2>
            <p>
              As tools are connected, Ferocity can track the path from source to lead, booked appointment,
              estimate, job, invoice, payment, review, and repeat work. That is how marketing becomes more than clicks.
            </p>
          </div>
          <div className="notice-card">
            <BarChart3 size={20} />
            <div>
              <strong>Qualified data matters</strong>
              <p className="muted">
                Ferocity prepares for cleaner conversion tracking without pretending every ad platform is connected on day one.
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Run the free audit, then turn the score into a working Ferocity setup.</h2>
            <p>It is the simplest path from what is broken to what Ferocity should help run first.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/business-health-score?source=growth_system_bottom">
              Run free audit <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">See plans</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
