import Link from "next/link";

export default async function CheckoutCancelPage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const planQuery = params.plan ? `?plan=${encodeURIComponent(params.plan)}&source=checkout_cancel` : "?source=checkout_cancel";

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
          <p className="eyebrow">Checkout canceled</p>
          <h1>No plan was started.</h1>
          <p className="muted">
            You can go back to plans, request setup help, or keep touring Ferocity. No billing changes were made from this page.
          </p>
          <div className="button-row">
            <Link className="button" href="/pricing">
              Back to plans
            </Link>
            <Link className="button secondary-button" href={`/start${planQuery}`}>
              Request setup help
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
