import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "Ferocity Integrations",
  description: "Connect the customer, communication, work, money, and growth systems your business already uses—without making your team manage the plumbing.",
  alternates: { canonical: "/integrations" }
};

const outcomes = [
  ["Customers and sales", "Bring inquiries, contacts, conversations, estimates, appointments, and existing customer history into one operating context."],
  ["Calls, text, and email", "Keep customer communication connected to the person, opportunity, job, invoice, and next responsible action."],
  ["Work and scheduling", "Coordinate calendars, service systems, marketplace sources, assignments, field updates, and delivery without rebuilding the business around Ferocity."],
  ["Money and reporting", "Connect payments, invoices, expenses, attribution, analytics, and exports so the owner can see what actually produced revenue."],
  ["Marketing and reputation", "Coordinate websites, local presence, reviews, content, social channels, and advertising through the same customer and revenue history."],
  ["AI and specialist providers", "Use Ferocity's native intelligence or approved outside services while Ferocity keeps authority, context, and traceability in one place."]
];

const connectionTruth = [
  ["Available without another account", "App alerts, task queues, hosted forms and pages, private calendar feeds, drafts, and approved exports."],
  ["Connect through normal sign-in", "Supported customer accounts use the provider's authorization screen. Customers should not need to understand developer keys or app secrets."],
  ["Assisted when direct access is limited", "Ferocity can prepare a reviewed package, use a permitted connector, or guide the minimum manual step rather than pretending direct automation exists."],
  ["Request another system", "A reviewed connection request can extend Ferocity without exposing credentials or changing the core business workflow."]
];

export default function PublicIntegrationsPage() {
  return (
    <main className="public-page public-integrations-page">
      <section className="public-shell">
        <PublicNav />
        <section className="public-hero integrations-hero">
          <p className="eyebrow">Connected business—not integration homework</p>
          <h1>Keep the systems that work. Stop making people carry the context between them.</h1>
          <p className="muted">
            Ferocity connects the business around customers, work, money, communication, and growth. You choose the outcome; Ferocity guides the accounts that matter and keeps unsupported paths honest.
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=integrations">Start guided setup <ArrowRight size={16} /></Link>
            <Link className="button secondary-button" href="/#ask-ferocity">Ask about compatibility</Link>
            <Link className="button secondary-button" href="/ferocity-connect">See Ferocity Connect</Link>
          </div>
        </section>

        <section aria-labelledby="integration-outcomes-title">
          <div className="section-actions">
            <p className="eyebrow">What becomes connected</p>
            <h2 id="integration-outcomes-title">The result matters more than the provider list.</h2>
            <p className="muted">Start with one broken handoff. Add only the accounts needed to make that outcome work.</p>
          </div>
          <div className="integration-outcome-grid">
            {outcomes.map(([title, body]) => (
              <article className="integration-outcome-card" key={title}>
                <CheckCircle2 size={18} />
                <div><strong>{title}</strong><p>{body}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="integration-connection-story" aria-label="How connecting an account works">
          <div>
            <p className="eyebrow">A normal customer experience</p>
            <h2>Choose the account. Sign in. Grant access. Keep moving.</h2>
            <p className="muted">Ferocity owns the platform-level developer work where providers allow it. Your business keeps control of its own accounts and can revoke access.</p>
          </div>
          <ol>
            <li><span>1</span><div><strong>Choose the outcome</strong><small>Ferocity identifies which connection is actually needed.</small></div></li>
            <li><span>2</span><div><strong>Authorize the account</strong><small>Use the provider&apos;s familiar sign-in and permission screen.</small></div></li>
            <li><span>3</span><div><strong>Verify before live work</strong><small>Ferocity checks access, capability, authority, and the first real result.</small></div></li>
          </ol>
        </section>

        <details className="panel integration-readiness-details">
          <summary>See connection methods and readiness rules</summary>
          <p className="muted">Exact availability depends on the provider, the customer&apos;s account, provider approval, requested permissions, and successful certification. Ferocity shows the live status during setup.</p>
          <div className="public-grid">
            {connectionTruth.map(([title, body]) => <article key={title}><strong>{title}</strong><p className="muted">{body}</p></article>)}
          </div>
        </details>

        <section className="source-tracking-band integration-proof-band">
          <div>
            <p className="eyebrow">The connection should prove its value</p>
            <h2>Follow the result from the first signal to collected revenue.</h2>
            <p className="muted">Ferocity keeps source and campaign context attached as an inquiry becomes a conversation, estimate, scheduled work, invoice, payment, review, repeat customer, or referral.</p>
          </div>
          <div className="source-step-grid">
            {["Signal captured", "Customer identified", "Next step owned", "Revenue attributed", "Outcome improves the next decision"].map((item) => <div key={item}><ShieldCheck size={16} /><strong>{item}</strong></div>)}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Connect only what helps</p>
            <h2>Tell Ferocity the result you want. Let setup follow the business problem.</h2>
            <p>No giant technical checklist. No pretending every provider supports the same actions.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/start?source=integrations_bottom">Start guided setup</Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
