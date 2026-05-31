import Link from "next/link";

export default async function PortalPaymentSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ invoice?: string; session_id?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div className="panel auth-panel">
          <p className="eyebrow">Payment Received</p>
          <h1>Thank you. The payment was submitted.</h1>
          <p className="muted">
            Ferocity will update the invoice after Stripe confirms the payment through the verified webhook.
          </p>
          {params.invoice ? <p className="muted">Invoice: {params.invoice}</p> : null}
          <Link className="button" href="/">
            Back to Ferocity
          </Link>
        </div>
      </section>
    </main>
  );
}
