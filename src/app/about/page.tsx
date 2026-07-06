import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Ferocity",
  description:
    "Ferocity is an AI workforce and owner command center for businesses that need more customers, faster follow-up, cleaner operations, payments, reviews, team work, and owner alerts.",
  alternates: {
    canonical: "/about"
  }
};

export default function AboutPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/install">Install App</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>
        <section className="public-hero">
          <p className="eyebrow">About Ferocity</p>
          <h1>An AI workforce for owners who want their life back.</h1>
          <p className="muted">
            Ferocity helps owners and teams keep marketing, leads, follow-up, estimates, jobs or orders, reviews, payments, and revenue in one practical workspace.
            The goal is to support people, reduce repetitive admin work, and help the business move faster without making the owner babysit every task.
            Contractors are included, but Ferocity is not boxed into contractor software. It can support law firms, clinics, shops,
            agencies, sales teams, e-commerce, local operators, multi-location companies, and owners with one business or several ventures.
            Rental-specific operations can connect through dedicated rental tools instead of forcing Ferocity to become a rental manager.
          </p>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>What it does</h2>
            <p className="muted">
              Ferocity tracks lead sources, connects website and marketing activity, shows stale opportunities, creates follow-up tasks, drafts marketing work, and keeps customer-facing actions under approval.
            </p>
          </div>
          <div className="panel">
            <h2>Automations</h2>
            <p className="muted">
              Lead replies, callback reminders, stale lead recovery, estimate follow-up, invoice follow-up, review requests, SEO drafts, and operator alerts go through review before customer-facing action.
            </p>
          </div>
          <div className="panel">
            <h2>What it does not do</h2>
            <p className="muted">
              Ferocity does not send messages, publish content, change ads, or start billing without the right connected account, review rules, and customer consent.
            </p>
          </div>
          <div className="panel">
            <h2>Contact</h2>
            <p className="muted">Primary contact: ferocityflow@outlook.com</p>
          </div>
        </section>
      </section>
    </main>
  );
}
