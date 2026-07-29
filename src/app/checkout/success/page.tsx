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
          <h1>Payment complete. Check your email.</h1>
          <p className="muted">
            Ferocity is verifying the Stripe subscription and preparing the workspace.
            The activation link will be sent to the email used at checkout.
            {params.plan ? ` Selected plan: ${params.plan}.` : ""}
          </p>
          <div className="button-row">
            <Link className="button" href="/login">Sign in</Link>
            <Link className="button secondary-button" href="/pricing">Review plans</Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Still controlled</h2>
              <p className="muted">
                Payment activates the subscription. It does not turn on publishing, ad spend, provider sync,
                calling, or customer messaging. Those actions still follow workspace setup and approval controls.
              </p>
            </div>
            <CheckCircle2 size={24} />
          </div>
        </section>
      </section>
    </main>
  );
}
