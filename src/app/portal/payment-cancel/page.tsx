import Link from "next/link";

export default async function PortalPaymentCancelPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const params = await searchParams;

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div className="panel auth-panel">
          <p className="eyebrow">Payment Not Completed</p>
          <h1>The payment was canceled.</h1>
          <p className="muted">No payment was recorded. Use the invoice link again or contact the business if you need help.</p>
          {params.invoice ? <p className="muted">Invoice: {params.invoice}</p> : null}
          <Link className="button" href="/">
            Back to Ferocity
          </Link>
        </div>
      </section>
    </main>
  );
}
