import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Code2, FileText, Globe2, MousePointerClick, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Connect Your Website and Marketing Platforms to Ferocity",
  description:
    "Add Ferocity lead capture, source tracking, search drafts, review requests, follow-up, and marketing attribution to an existing business website.",
  alternates: {
    canonical: "/connect-website"
  }
};

const connectionSteps = [
  {
    title: "Add the business website",
    body: "Ferocity reads the public website so it understands the business, services, and service area. It does not change the site.",
    icon: Globe2
  },
  {
    title: "Add a quote link or form",
    body: "Put a Ferocity form link, button, or embed on the existing website so leads enter the workspace with source data attached.",
    icon: MousePointerClick
  },
  {
    title: "Track where leads came from",
    body: "Ferocity keeps UTM, page URL, referrer, campaign, service, and city context with the lead whenever possible.",
    icon: Code2
  },
  {
    title: "Draft SEO and marketing",
    body: "Ferocity prepares search pages, Google posts, social posts, review requests, campaign ideas, and website content paths for review.",
    icon: FileText
  },
  {
    title: "Nothing goes live by surprise",
    body: "Website changes, customer messages, ads, payments, and publishing only happen after the right accounts are connected and approved.",
    icon: ShieldCheck
  }
];

const options = [
  ["Fastest", "Add a quote button", "Best when the business already has a website and only needs leads routed into Ferocity."],
  ["Most flexible", "Embed a Ferocity form", "Best when the website can add an iframe or form section and the owner wants cleaner capture."],
  ["No website yet", "Use hosted growth pages", "Best when Ferocity needs to host a campaign, service, or city page quickly."],
  ["SEO-first", "Move finished pages to the existing site", "Best when a developer, WordPress, Webflow, Netlify, or CMS workflow can place the content."],
  ["Marketplace", "Connect marketplace leads", "Best when public discovery or partner leads should flow back into Ferocity follow-up."]
];

const simpleSetup = [
  ["1", "Paste the website URL", "Ferocity reads the public site and prepares a plain setup plan."],
  ["2", "Add one line of code", "The quote button and tracking helper can be added to the site footer or custom code area."],
  ["3", "Test one lead", "Submit the form once. Ferocity should show the lead, page, campaign, source, and next follow-up."],
  ["4", "Approve the growth plan", "SEO drafts, review requests, follow-up, and marketing stay reviewed before anything goes live."]
];

export default function ConnectWebsitePage() {
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
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/start">Start</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/install">Install App</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Website + marketing platforms</p>
          <h1>Ferocity connects to the website so leads, campaigns, follow-up, and revenue can be tracked.</h1>
          <p className="muted">
            The simple version: paste the website URL, add one Ferocity line to the site, test one lead, then let Ferocity
            recommend the marketing, follow-up, review, and attribution system.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=connect_website">
              Get website plan <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/demo">
              See demo
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
            <Link className="button secondary-button" href="/install">
              Install app
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Almost effortless setup</p>
              <h2>The owner should not need to understand tracking.</h2>
              <p className="muted">Ferocity gives them the form, script, test link, and next actions in one setup path.</p>
            </div>
            <CheckCircle2 size={22} />
          </div>
          <div className="feature-loop">
            {simpleSetup.map(([number, title, body]) => (
              <article key={title}>
                <span>{number}</span>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-loop">
          {connectionSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title}>
                <span>{index + 1}</span>
                <Icon size={20} />
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </article>
            );
          })}
        </section>

        <section className="feature-split">
          <article className="panel">
            <p className="eyebrow">Website connection options</p>
            <h2>Pick the path that fits the business.</h2>
            <div className="stacked-list">
              {options.map(([label, title, body]) => (
                <div className="list-row flush-row" key={title}>
                  <div>
                    <span className="pill">{label}</span>
                    <h3>{title}</h3>
                    <p className="muted">{body}</p>
                  </div>
                  <CheckCircle2 size={18} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">What Ferocity tracks</p>
            <h2>Leads should not arrive as mystery contacts.</h2>
            <ul className="plain-list">
              <li>Website form, hosted page, search pages, Google profile work, reviews, Facebook, paid ads, phone calls, referrals, and marketplace sources.</li>
              <li>Page URL, source, medium, campaign, service, city, and message context when available.</li>
              <li>Lead status, follow-up task, estimate, job, invoice, review request, and revenue outcome.</li>
              <li>Website drafts and exports without surprise publishing.</li>
            </ul>
          </article>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <p className="eyebrow">Simple owner version</p>
              <h2>What does the owner actually do?</h2>
            </div>
            <ShieldCheck size={22} />
          </div>
          <ul className="plain-list">
            <li>Give Ferocity the website URL.</li>
            <li>Choose a quote button, embedded form, hosted page, website content path, or marketplace source.</li>
            <li>Look over the setup plan and draft content before anything changes.</li>
            <li>Put the provided link, form, or script on the website, or have a developer do it.</li>
            <li>Turn on messages, publishing, payments, or ads only after the accounts are connected and the business is ready.</li>
          </ul>
          <div className="button-row">
            <Link className="button" href="/start?source=connect_website_bottom">
              Start website setup <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/features">
              See all features
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
