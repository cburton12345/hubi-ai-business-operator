import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { getPublicPlan } from "@/lib/billing/public-plans";

export const metadata: Metadata = {
  title: "Start Ferocity",
  description: "Choose a Ferocity plan, pay securely, and activate your business workspace.",
  alternates: { canonical: "/subscribe" }
};

export default async function SubscribePage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string; error?: string }>;
}) {
  const params = await searchParams;
  const plan = getPublicPlan(params.plan ?? "") ?? getPublicPlan("growth")!;

  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">Ferocity</Link>
          <div>
            <Link href="/pricing">Plans</Link>
            <Link href="/business-health-score">Free Grader</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Start {plan.name}</p>
          <h1>One short step, then secure checkout.</h1>
          <p className="muted">
            Tell us where to create the workspace. Stripe handles payment securely, then Ferocity sends the account activation link.
          </p>
        </section>

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
              Customer messaging, ad spend, publishing, and connected-provider actions remain off until you configure and approve them.
            </p>
          </form>

          <aside className="panel span-5">
            <p className="eyebrow">What happens next</p>
            <div className="stacked-list">
              {[
                "Complete payment in Stripe Checkout.",
                "Ferocity verifies the subscription before creating access.",
                "Open the activation email and choose your password.",
                "Follow the guided setup inside your workspace."
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
                <strong>No surprise automation</strong>
                <p className="muted">Payment activates the plan. It does not authorize Ferocity to spend, send, publish, or call without setup.</p>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
