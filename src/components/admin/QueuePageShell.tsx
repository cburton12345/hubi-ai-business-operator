import Link from "next/link";

export function QueuePageShell({
  eyebrow,
  title,
  description,
  dashboardLabel = "Dashboard",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dashboardLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="queue-page page-section">
      <header className="queue-page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
        <Link className="mini-button" href="/app">
          {dashboardLabel}
        </Link>
      </header>

      <section className="panel queue-page-content">{children}</section>
    </section>
  );
}
