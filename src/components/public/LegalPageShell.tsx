import type { ReactNode } from "react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

export function LegalPageShell({
  eyebrow,
  title,
  updated = "August 5, 2026",
  children
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <PublicNav />
        <section className="panel">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="muted">Last updated: {updated}</p>
          {children}
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}
