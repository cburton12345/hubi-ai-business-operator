import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, FileText, Globe2, MousePointerClick, ShieldCheck } from "lucide-react";

const connectionSteps = [
  {
    title: "Add the business website",
    body: "Ferocity reads the public page for review-ready business facts. Nothing gets published or changed from the import.",
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
    body: "Service pages, city pages, GBP posts, social posts, review requests, and campaign ideas stay draft-first.",
    icon: FileText
  },
  {
    title: "Approve before anything goes live",
    body: "Publishing, email, SMS, ads, provider sync, and customer messages require connected accounts, limits, and approval.",
    icon: ShieldCheck
  }
];

const options = [
  ["Fastest", "Add a quote button", "Best when the business already has a website and only needs leads routed into Ferocity."],
  ["Most flexible", "Embed a Ferocity form", "Best when the website can add an iframe or form section and the owner wants cleaner capture."],
  ["No website yet", "Use hosted growth pages", "Best when Ferocity needs to host a campaign, service, or city page quickly."],
  ["SEO-first", "Publish approved drafts to the existing site", "Best when a developer, WordPress, Webflow, Netlify, or CMS workflow can place reviewed content."],
  ["Marketplace", "Connect MarketplacePro", "Best when public discovery and vendor leads should flow back into Ferocity follow-up."]
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
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Connect the website</p>
          <h1>Ferocity plugs into the business website without taking it over.</h1>
          <p className="muted">
            The website stays the business home base. Ferocity adds lead capture, source tracking, reviewed SEO drafts,
            follow-up, reviews, and revenue visibility around it.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=connect_website">
              Start setup <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/demo">
              See demo
            </Link>
            <Link className="button secondary-button" href="/pricing">
              View plans
            </Link>
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
            <p className="eyebrow">Website hookup options</p>
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
              <li>Website form, hosted page, SEO, GBP, reviews, Facebook, paid ads, phone calls, referrals, and MarketplacePro.</li>
              <li>Page URL, source, medium, campaign, service, city, and message context when available.</li>
              <li>Lead status, follow-up task, estimate, job, invoice, review request, and revenue outcome.</li>
              <li>Approved website drafts and exports without surprise publishing.</li>
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
            <li>Choose quote button, embedded form, hosted page, approved publishing, or MarketplacePro.</li>
            <li>Review the setup plan and draft content before applying it.</li>
            <li>Put the provided link, form, or script on the website, or have a developer do it.</li>
            <li>Turn on live sending, publishing, payments, or ads only after keys and approvals are ready.</li>
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
