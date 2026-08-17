import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { getPublicPlan, publicPlans } from "@/lib/billing/public-plans";

export const metadata: Metadata = {
  title: "Start Ferocity | Choose Your Operating Level",
  description: "Choose how much of the organization Ferocity should coordinate, pay securely, and activate the shared Business Brain for your human and AI workforce.",
  alternates: { canonical: "/subscribe" }
};

export default async function SubscribePage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string; error?: string }>;
}) {
  const params = await searchParams;
  const plan = getPublicPlan(params.plan ?? "");
  const isCallsPlan = plan?.key === "calls";
  const planGuidance = {
    calls: "A complete AI phone team with simple usage-based voice billing.",
    job_tracker: "Focused job and money control with basic AI guidance.",
    starter: "The shared business memory and everyday control layer.",
    growth: "The connected revenue, reputation, and marketing engine.",
    operator: "The proactive operating system across the whole business."
  } as const;

  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">{plan ? `Start ${plan.name}` : "Choose your operating level"}</p>
          <h1>{isCallsPlan ? "Give every caller an intelligent next step." : plan ? "Give your team and AI workforce one operating system." : "Choose how much of the organization Ferocity should coordinate."}</h1>
          <p className="muted">
            {isCallsPlan
              ? "Start with a 24/7 AI phone department that understands the business, recognizes callers, qualifies opportunities, books approved appointments, transfers urgent calls, and keeps the complete call history in Ferocity."
              : plan
              ? "Create the account, teach the shared Business Brain how the company works, and choose which work belongs to people, AI employees, approval, or authorized automation."
              : "Every plan starts with connected business memory and real AI guidance. Higher levels coordinate more people, AI employees, departments, providers, and operating loops."}
          </p>
          <div className="trust-strip" aria-label="Ferocity activation assurances">
            <span><ShieldCheck size={15} /> Secure Stripe checkout</span>
            <span><CheckCircle2 size={15} /> Guided Business Brain setup</span>
            <span><CheckCircle2 size={15} /> Change authority at any time</span>
          </div>
        </section>

        <section className="plan-selector" aria-label="Choose a Ferocity plan">
          {publicPlans.map((option) => (
            <Link
              className={`panel plan-choice${plan?.key === option.key ? " selected-plan-choice" : ""}`}
              href={`/subscribe?plan=${option.key}`}
              key={option.key}
              aria-current={plan?.key === option.key ? "page" : undefined}
            >
              <span>
                <span className="eyebrow">
                  {option.featured ? "Most popular · " : ""}
                  {option.name}
                </span>
                <strong>{option.price}</strong>
              </span>
              <small>{planGuidance[option.key]}</small>
              <span className="plan-choice-action">
                {plan?.key === option.key ? "Selected" : `Choose ${option.name}`}
              </span>
            </Link>
          ))}
        </section>

        {plan ? (
          <section className="start-grid">
            <form action="/api/billing/checkout" method="post" className="panel form-stack span-7">
              <input name="plan" type="hidden" value={plan.key} />
              <input name="source" type="hidden" value="public_subscribe" />

              <div>
                <p className="eyebrow">{plan.name}</p>
                <strong className="price-line">{plan.price}</strong>
                <h2>{plan.fit}</h2>
                <p className="muted">{plan.bestFor}</p>
              </div>

              <ul className="plain-list">
                {plan.bullets.slice(0, 4).map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {params.error ? (
                <p className="form-error">
                  Checkout could not start. Check the required information and try again.
                </p>
              ) : null}

              <label>
                Work email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Company name
                <input name="companyName" autoComplete="organization" required />
              </label>
              <label>
                Your name <span className="muted">(optional)</span>
                <input name="name" autoComplete="name" />
              </label>
              <label className="checkbox-row">
                <input name="consentToContact" type="checkbox" required />
                <span>I agree Ferocity can email me the receipt, account activation link, and essential service notices.</span>
              </label>

              <button className="button" type="submit">
                Continue to secure checkout <ArrowRight size={16} />
              </button>
              <p className="muted">
                {isCallsPlan
                  ? "The subscription is $49 per month plus $0.25 per completed voice minute. During setup, choose the phone route, business rules, recording settings, transfers, scheduling authority, and follow-up behavior."
                  : "During setup, assign work to a person or choose Draft only, Ask first, or Run automatically for an AI employee. Ferocity remembers the rules and shows what happened."}
              </p>
            </form>

            <aside className="panel span-5">
              <p className="eyebrow">What happens next</p>
              <div className="stacked-list">
                {[
                  "Complete payment securely in Stripe Checkout.",
                  "Activate the workspace from the verified account email.",
                  "Teach the Business Brain the services, people, customers, rules, and priorities that matter.",
                  "Choose which work belongs to people, AI employees, approval, or authorized automation."
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
                  <strong>Your team stays in control without becoming the bottleneck</strong>
                  <p className="muted">Your authority, consent, spending, publishing, payment, and provider rules govern every action—and can be changed later.</p>
                </div>
              </div>
            </aside>
          </section>
        ) : (
          <section className="panel plan-help-card">
            <div>
              <p className="eyebrow">Not sure?</p>
              <h2>Growth connects the customer, revenue, reputation, and marketing teams for most established businesses.</h2>
              <p className="muted">
                Choose Job Tracker for focused job and money control, Starter for everyday business memory,
                Growth for the connected revenue engine, or Operator for proactive operations across the company.
              </p>
            </div>
            <Link className="button secondary-button" href="/pricing">Compare everything included</Link>
          </section>
        )}
        <PublicFooter />
      </section>
    </main>
  );
}
