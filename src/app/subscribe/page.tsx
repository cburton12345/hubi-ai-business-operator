import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { getPublicPlan, publicPlans } from "@/lib/billing/public-plans";

const planDisplayOrder = ["starter", "growth", "operator", "job_tracker", "calls", "ferocity_connect"];
const orderedPublicPlans = [...publicPlans].sort(
  (left, right) => planDisplayOrder.indexOf(left.key) - planDisplayOrder.indexOf(right.key)
);

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
    ferocity_connect: "Approved Android business texting with Ferocity safety and delivery controls.",
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
          <p className="eyebrow">{plan ? "Selected plan" : "Choose your operating level"}</p>
          <h1>{plan ? `Start ${plan.name}.` : "Choose how much of the organization Ferocity should coordinate."}</h1>
          <p className="muted">
            {plan
              ? `${plan.fit} Enter the account details below, then continue to secure checkout.`
              : "Every plan starts with connected business memory and real AI guidance. Higher levels coordinate more people, AI employees, departments, providers, and operating loops."}
          </p>
          <div className="trust-strip" aria-label="Ferocity activation assurances">
            <span><ShieldCheck size={15} /> Secure Stripe checkout</span>
            <span><CheckCircle2 size={15} /> Guided Business Brain setup</span>
            <span><CheckCircle2 size={15} /> Change authority at any time</span>
          </div>
        </section>

        {!plan ? (
          <section className="plan-selector" aria-label="Choose a Ferocity plan">
            {orderedPublicPlans.map((option) => (
              <Link className="panel plan-choice" href={`/subscribe?plan=${option.key}`} key={option.key}>
                <span>
                  <span className="eyebrow">{option.featured ? "Most popular · " : ""}{option.name}</span>
                  <strong>{option.price}</strong>
                </span>
                <small>{planGuidance[option.key]}</small>
                <span className="plan-choice-action">Choose {option.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {plan ? (
          <section className="start-grid">
            <form action="/api/billing/checkout" method="post" className="panel form-stack span-7">
              <input name="plan" type="hidden" value={plan.key} />
              <input name="source" type="hidden" value="public_subscribe" />

              <div>
                <p className="eyebrow">Account details</p>
                <h2>Where should Ferocity create the workspace?</h2>
                <p className="muted">{plan.name} · {plan.price} · <Link href="/pricing#plans">Change plan</Link></p>
              </div>

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
              <label className="checkbox-row">
                <input name="termsAccepted" type="checkbox" required />
                <span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
              </label>

              <button className="button" type="submit">
                Continue to secure checkout <ArrowRight size={16} />
              </button>
              <p className="muted">
                {isCallsPlan
                  ? "Renews monthly until canceled, plus $0.25 per completed voice minute. Phone behavior is configured after checkout."
                  : "Renews monthly until canceled. Business rules and AI authority are configured after checkout and can be changed later."}
              </p>
            </form>

            <aside className="panel span-5">
              <p className="eyebrow">What happens next</p>
              <div className="stacked-list">
                {[
                  "Complete payment securely in Stripe Checkout.",
                  "Activate the workspace from the verified account email.",
                  "Follow the guided setup; detailed choices can wait until then."
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
