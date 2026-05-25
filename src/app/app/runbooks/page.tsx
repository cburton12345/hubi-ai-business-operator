import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";

const runbooks = [
  {
    title: "Customer onboarding",
    href: "/docs/customer-onboarding-runbook.md",
    summary: "Create organizations, brands, forms, users, and weekly operating routines."
  },
  {
    title: "Production safety",
    href: "/docs/production-safety-runbook.md",
    summary: "Secrets, backups, migration rollback, error handling, and verification."
  },
  {
    title: "Production readiness",
    href: "/docs/phase45-production-readiness.md",
    summary: "Environment policy, RLS, API validation, deploy smoke checks, monitoring, and security review."
  },
  {
    title: "Ferocity domain and rename",
    href: "/docs/ferocity-domain-and-rename-runbook.md",
    summary: "GitHub rename, Render service rename, custom domain, DNS, and callback URL steps."
  },
  {
    title: "Final non-key readiness",
    href: "/docs/phase53-final-non-key-readiness.md",
    summary: "Workspace routes, UI polish, security headers, operational QA, and key-gated launch notes."
  },
  {
    title: "SEO autopilot foundation",
    href: "/docs/phase54-seo-autopilot-foundation.md",
    summary: "Draft-only SEO topic clusters, content drafts, metadata, internal links, and refresh recommendations."
  },
  {
    title: "Beta launch",
    href: "/docs/phase15-16-beta-and-launch-readiness.md",
    summary: "Beta QA sequence and manual-only launch rules."
  }
];

export default function RunbooksPage() {
  return (
    <QueuePageShell
      eyebrow="Runbooks"
      title="Operator Runbooks"
      description="Launch and operating documentation for external customer workspaces."
    >
      <div className="grid">
        {runbooks.map((runbook) => (
          <section className="panel span-4" key={runbook.title}>
            <h2>{runbook.title}</h2>
            <p className="muted">{runbook.summary}</p>
            <Link className="button secondary-button" href={runbook.href}>Open doc</Link>
          </section>
        ))}
      </div>
    </QueuePageShell>
  );
}
