import Link from "next/link";

export function QueuePageShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="page-shell">
      <section className="workspace page-section">
        <div className="topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="muted">{description}</p>
          </div>
          <Link className="button secondary-button" href="/app">
            Dashboard
          </Link>
        </div>

        <section className="panel span-12">{children}</section>
      </section>
    </main>
  );
}
