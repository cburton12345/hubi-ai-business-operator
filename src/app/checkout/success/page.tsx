import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function CheckoutSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string }>;
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
            <Link href="/pricing">Plans</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Checkout received</p>
          <h1>Payment step finished.</h1>
          <p className="muted">
            Ferocity can now finish workspace setup after Stripe webhooks and subscription mapping confirm the plan.
            {params.plan ? ` Selected plan: ${params.plan}.` : ""}
          </p>
          <div className="button-row">
            <Link className="button" href="/start?source=checkout_success">
              Finish setup details
            </Link>
            <Link className="button secondary-button" href="/login">
              Sign in
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Still controlled</h2>
              <p className="muted">
                Checkout does not turn on SMS, email, publishing, ad spend, provider sync, or customer messaging by itself.
              </p>
            </div>
            <CheckCircle2 size={24} />
          </div>
        </section>
      </section>
    </main>
  );
}
