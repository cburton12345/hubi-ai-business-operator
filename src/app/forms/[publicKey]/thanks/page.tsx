import Link from "next/link";

export default function PublicLeadThanksPage() {
  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Received</p>
          <h1>Thanks. Your request has been captured.</h1>
          <p className="muted">The operator dashboard will show this as a new lead for the correct brand.</p>
        </div>
        <Link className="button secondary-button" href="/">
          Back
        </Link>
      </section>
    </main>
  );
}
