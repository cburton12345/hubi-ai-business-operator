import Link from "next/link";

export default function PublicWorkerIntakeThanksPage() {
  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Received</p>
          <h1>Your availability was submitted.</h1>
          <p className="muted">
            The business owner can now review it in Ferocity&apos;s Labor Bench. If there is a fit, they can approve contact and follow up.
          </p>
        </div>
        <Link className="button secondary-button" href="/">
          Back
        </Link>
      </section>
    </main>
  );
}
